"use client";

import { useState, useEffect, useId, isValidElement, cloneElement } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useToast } from "@/components/Toast";

const LO_OPTIONS = ["LO15", "LO17", "LO19", "LO21", "LO23", "LO25", "LO27", "LO29", "LO31", "LO33"];

const EMPTY = {
  name: "",
  description: "",
  creator: "",
  jobCreated: "",
  company: "",
  logoUrl: "",
  includeHeight: false,
  coordinateSystemName: "",
  coordinateSystemCreated: "",
  transformationName: "",
  transformationType: "Twostep",
  heightMode: "",
  preTransformationName: "",
  residualsFormula: "",
  ellipsoid: "",
  projection: "",
  geoidModel: "",
  cscsModel: "",
  positionLimit: 0.05,
  heightLimit: 0.075,
  minTimeDiffMinutes: 25,
  coordDecimals: 4,
  timezone: "2h 00'",
  applicationSoftware: "LEICA Geo Office 7.0",
  firmwareVersion: "5.60",
  codelistName: "THEBE",
  transformation: { commonPoints: "", rotationOriginX: "", rotationOriginY: "", dE: "", dN: "", rotation: "", scalePpm: "" },
  heightTransformation: { commonPoints: "", meanAccuracy: "", parameters: "", inclinationX: "", inclinationY: "" },
};

export default function JobForm({ initial, jobId }) {
  const router = useRouter();
  const toast = useToast();
  const [form, setForm] = useState({
    ...EMPTY,
    ...initial,
    transformation: { ...EMPTY.transformation, ...(initial?.transformation || {}) },
    heightTransformation: { ...EMPTY.heightTransformation, ...(initial?.heightTransformation || {}) },
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  // Reusable coordinate systems (calibration entered once per system, reused).
  const [coordSystems, setCoordSystems] = useState([]);
  // Job "Created" entered as separate Day/Month/Year Hours/Min/Sec boxes so the
  // format is always consistent (client requirement); combined into
  // form.jobCreated as "DD/MM/YYYY HH:MM:SS".
  const [dt, setDt] = useState(() => parseDateParts(initial?.jobCreated));
  // Calibration "Created" uses the SAME six DD/MM/YYYY HH:MM:SS boxes as Job
  // Created (client: "choose and adopt 1 format") — combined into
  // form.coordinateSystemCreated as "DD/MM/YYYY HH:MM:SS".
  const [dtCs, setDtCs] = useState(() => partsFromAny(initial?.coordinateSystemCreated));

  useEffect(() => {
    api
      .get("/api/coordinate-systems")
      .then((list) => {
        const systems = Array.isArray(list) ? list : [];
        setCoordSystems(systems);
        // On a NEW job, auto-load the most recent coordinate system's calibration
        // so it's pre-filled (the surveyor can switch it via the dropdown).
        // Existing jobs keep their own saved values.
        if (!jobId && systems.length > 0 && !initial?.coordinateSystemName) {
          applyCoordSystem(systems[0]);
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  // Plot (small site) vs farm (large site) sets which minimum time gap is
  // (transformation + metadata) — "entered once per system, reused by every job".
  function applyCoordSystem(sys) {
    if (sys.coordinateSystemCreated) setDtCs(partsFromAny(sys.coordinateSystemCreated));
    setForm((f) => ({
      ...f,
      coordinateSystemName: sys.coordinateSystemName ?? f.coordinateSystemName,
      transformationName: sys.transformationName || sys.coordinateSystemName || "",
      transformationType: sys.transformationType || "Twostep",
      coordinateSystemCreated: sys.coordinateSystemCreated ?? "",
      heightMode: sys.heightMode ?? "",
      preTransformationName: sys.preTransformationName ?? "",
      residualsFormula: sys.residualsFormula ?? "",
      ellipsoid: sys.ellipsoid ?? "",
      projection: sys.projection ?? "",
      geoidModel: sys.geoidModel ?? "",
      cscsModel: sys.cscsModel ?? "",
      transformation: {
        commonPoints: sys.transformation?.commonPoints ?? "",
        rotationOriginX: sys.transformation?.rotationOriginX ?? "",
        rotationOriginY: sys.transformation?.rotationOriginY ?? "",
        dE: sys.transformation?.dE ?? "",
        dN: sys.transformation?.dN ?? "",
        rotation: sys.transformation?.rotation ?? "",
        scalePpm: sys.transformation?.scalePpm ?? "",
      },
      heightTransformation: {
        commonPoints: sys.heightTransformation?.commonPoints ?? "",
        meanAccuracy: sys.heightTransformation?.meanAccuracy ?? "",
        parameters: sys.heightTransformation?.parameters ?? "",
        inclinationX: sys.heightTransformation?.inclinationX ?? "",
        inclinationY: sys.heightTransformation?.inclinationY ?? "",
      },
    }));
  }

  // Set the coordinate-system name; mirror it to the transformation name; and if
  // it matches a saved coordinate system, auto-fill that system's calibration.
  function setCoordSystemName(v) {
    setForm((f) => ({ ...f, coordinateSystemName: v, transformationName: v }));
    const match = coordSystems.find(
      (s) => (s.coordinateSystemName || "").trim().toLowerCase() === v.trim().toLowerCase()
    );
    if (match) applyCoordSystem(match);
  }
  // Job "Created" (when the machine was set up on site). Auto-default the
  // coordinate-system (calibration) "Created" to ~1h30m EARLIER — the client
  // requires the calibration time to be older than the project creation time by
  // more than 1 hour — unless the user already set it or a saved system did.
  function setJobCreated(v) {
    setForm((f) => {
      const next = { ...f, jobCreated: v };
      if (!f.coordinateSystemCreated) {
        const d = parseDateTime(v);
        if (d) {
          d.setMinutes(d.getMinutes() - 90);
          next.coordinateSystemCreated = fmtDateTime(d);
          setDtCs(partsFromAny(next.coordinateSystemCreated));
        }
      }
      return next;
    });
  }
  // Update one date/time part (digits only, capped length) and rebuild the
  // combined "DD/MM/YYYY HH:MM:SS" string stored in form.jobCreated.
  function setDtPart(key, value) {
    const cleaned = value.replace(/\D/g, "").slice(0, key === "yyyy" ? 4 : 2);
    const next = { ...dt, [key]: cleaned };
    setDt(next);
    setJobCreated(combineDateParts(next));
  }
  // Same six-box editor for the calibration "Created" — kept in its own
  // form.coordinateSystemCreated as "DD/MM/YYYY HH:MM:SS".
  function setDtCsPart(key, value) {
    const cleaned = value.replace(/\D/g, "").slice(0, key === "yyyy" ? 4 : 2);
    const next = { ...dtCs, [key]: cleaned };
    setDtCs(next);
    set("coordinateSystemCreated", combineDateParts(next));
  }
  // When a SAVED coordinate system is selected, its calibration is fixed — lock
  // the transformation fields (only projection stays editable). A new/unknown
  // name leaves them editable so the system can be defined once.
  const isSavedSystem =
    !!form.coordinateSystemName.trim() &&
    coordSystems.some(
      (s) => (s.coordinateSystemName || "").trim().toLowerCase() === form.coordinateSystemName.trim().toLowerCase()
    );

  function setTransform(field, value) {
    setForm((f) => ({ ...f, transformation: { ...f.transformation, [field]: value } }));
  }
  function setHeightTransform(field, value) {
    setForm((f) => ({ ...f, heightTransformation: { ...f.heightTransformation, [field]: value } }));
  }

  async function submit(e) {
    e.preventDefault();
    if (!form.name.trim()) {
      setError("Job name is required");
      return;
    }
    const dtErr = dateTimeError(dt);
    if (dtErr) {
      setError(dtErr);
      return;
    }
    // Client rule — the system must REFUSE when the calibration time is not older
    // than the project creation time by more than 1 hour. (The report then also
    // derives the mean-coordinate observation times to sit ≥1h30m before this.)
    const csErr = dateTimeError(dtCs);
    if (csErr) {
      setError("Calibration (Coordinate System) created: " + csErr);
      return;
    }
    const tJob = parseDateTime(combineDateParts(dt));
    const tCal = parseDateTime(combineDateParts(dtCs));
    if (tJob && tCal && !(tJob.getTime() - tCal.getTime() > 60 * 60000)) {
      setError(
        "Calibration time must be OLDER than the Job Created time by more than 1 hour. Adjust the Created (Coordinate System) date/time."
      );
      return;
    }
    setSaving(true);
    setError("");
    try {
      const payload = {
        ...form,
        positionLimit: parseFloat(form.positionLimit) || 0.05,
        heightLimit: parseFloat(form.heightLimit) || 0.075,
        minTimeDiffMinutes: parseFloat(form.minTimeDiffMinutes) || 25,
        coordDecimals: form.coordDecimals === 3 ? 3 : 4,
        transformation: {
          commonPoints: numOrNull(form.transformation.commonPoints),
          rotationOriginX: numOrNull(form.transformation.rotationOriginX),
          rotationOriginY: numOrNull(form.transformation.rotationOriginY),
          dE: numOrNull(form.transformation.dE),
          dN: numOrNull(form.transformation.dN),
          rotation: form.transformation.rotation,
          scalePpm: numOrNull(form.transformation.scalePpm),
        },
        heightTransformation: {
          commonPoints: numOrNull(form.heightTransformation.commonPoints) ?? 0,
          meanAccuracy: numOrNull(form.heightTransformation.meanAccuracy),
          parameters: form.heightTransformation.parameters,
          inclinationX: form.heightTransformation.inclinationX,
          inclinationY: form.heightTransformation.inclinationY,
        },
      };
      const job = jobId
        ? await api.put(`/api/jobs/${jobId}`, payload)
        : await api.post("/api/jobs", payload);
      toast.success(jobId ? "Job saved." : `Job "${job.name}" created.`);
      router.push(`/jobs/${job._id}`);
      router.refresh();
    } catch (err) {
      setError(err.message);
      toast.error(err.message);
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <section className="card p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Job name *">
            <input className="input" required aria-required="true" value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="MATEBELE2022" />
          </Field>
          <Field label="Creator / surveyor">
            <input className="input" value={form.creator} onChange={(e) => set("creator", e.target.value)} placeholder="BISM" />
          </Field>
          <div className="sm:col-span-2">
            <label className="label">Job created (date / time) *</label>
            <div className="flex flex-wrap items-end gap-1.5">
              <DtBox label="DD" value={dt.dd} onChange={(v) => setDtPart("dd", v)} max={2} w="w-12" ph="29" />
              <span className="pb-2 text-slate-400">/</span>
              <DtBox label="MM" value={dt.mm} onChange={(v) => setDtPart("mm", v)} max={2} w="w-12" ph="06" />
              <span className="pb-2 text-slate-400">/</span>
              <DtBox label="YYYY" value={dt.yyyy} onChange={(v) => setDtPart("yyyy", v)} max={4} w="w-16" ph="2026" />
              <span className="px-2" />
              <DtBox label="Hrs" value={dt.hh} onChange={(v) => setDtPart("hh", v)} max={2} w="w-12" ph="16" />
              <span className="pb-2 text-slate-400">:</span>
              <DtBox label="Min" value={dt.mi} onChange={(v) => setDtPart("mi", v)} max={2} w="w-12" ph="28" />
              <span className="pb-2 text-slate-400">:</span>
              <DtBox label="Sec" value={dt.ss} onChange={(v) => setDtPart("ss", v)} max={2} w="w-12" ph="04" />
            </div>
            <p className="mt-1 text-[11px] text-slate-400">
              Format: DD / MM / YYYY&nbsp;&nbsp;HH : MM : SS (24-hour). All boxes are required.
            </p>
          </div>
          <Field label="Description" full>
            <input className="input" value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="CAD / cadastral survey" />
          </Field>
        </div>
      </section>

      <section className="card p-5">
        <h2 className="mb-1 text-sm font-bold uppercase tracking-wide text-slate-500">
          Calibration / coordinate system
        </h2>
        <p className="mb-4 text-xs text-slate-400">
          The transformation established when the equipment was calibrated against the local grid.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Coordinate system name">
            <input
              className="input"
              list="coord-systems"
              value={form.coordinateSystemName}
              onChange={(e) => setCoordSystemName(e.target.value)}
              placeholder="MATEBELE2D"
            />
            <datalist id="coord-systems">
              {coordSystems.map((s) => (
                <option key={s.coordinateSystemName} value={s.coordinateSystemName} />
              ))}
            </datalist>
            {coordSystems.length > 0 && (
              <p className="mt-1 text-[11px] text-slate-400">
                Pick a saved system to auto-fill its calibration, or type a new name (entered once, reused).
              </p>
            )}
          </Field>
          <Field label="Projection / LO">
            <input
              className="input"
              list="lo-options"
              value={form.projection}
              onChange={(e) => set("projection", e.target.value)}
              placeholder="LO27 / TM27"
              disabled={false}
            />
            <datalist id="lo-options">
              {LO_OPTIONS.map((lo) => (
                <option key={lo} value={lo} />
              ))}
            </datalist>
          </Field>
          <div className="sm:col-span-2">
            <label className="label">Created (Coordinate System)</label>
            <div className="flex flex-wrap items-end gap-1.5">
              <DtBox label="DD" value={dtCs.dd} onChange={(v) => setDtCsPart("dd", v)} max={2} w="w-12" ph="07" />
              <span className="pb-2 text-slate-400">/</span>
              <DtBox label="MM" value={dtCs.mm} onChange={(v) => setDtCsPart("mm", v)} max={2} w="w-12" ph="06" />
              <span className="pb-2 text-slate-400">/</span>
              <DtBox label="YYYY" value={dtCs.yyyy} onChange={(v) => setDtCsPart("yyyy", v)} max={4} w="w-16" ph="2026" />
              <span className="px-2" />
              <DtBox label="Hrs" value={dtCs.hh} onChange={(v) => setDtCsPart("hh", v)} max={2} w="w-12" ph="09" />
              <span className="pb-2 text-slate-400">:</span>
              <DtBox label="Min" value={dtCs.mi} onChange={(v) => setDtCsPart("mi", v)} max={2} w="w-12" ph="21" />
              <span className="pb-2 text-slate-400">:</span>
              <DtBox label="Sec" value={dtCs.ss} onChange={(v) => setDtCsPart("ss", v)} max={2} w="w-12" ph="00" />
            </div>
            <p className="mt-1 text-[11px] text-slate-400">
              Format: DD / MM / YYYY&nbsp;&nbsp;HH : MM : SS (24-hour). Must be at least 1 hour older than Job Created.
            </p>
          </div>
        </div>

        {/*
          Everything else below is calibration "default" data — it comes from the
          saved coordinate system (or, once implemented, gets computed automatically
          from the imported control-point CSV). The client doesn't want to see any
          of it in the form, so it stays as plain background state: not rendered,
          just carried along and saved with the job.
        */}
        <input type="hidden" value={form.transformationName} readOnly />
        <input type="hidden" value={form.transformationType || "Twostep"} readOnly />
        <input type="hidden" value={form.preTransformationName} readOnly />
        <input type="hidden" value={form.residualsFormula} readOnly />
        <input type="hidden" value={form.ellipsoid} readOnly />
        <input type="hidden" value={form.heightMode} readOnly />
        <input type="hidden" value={form.transformation.commonPoints} readOnly />
        <input type="hidden" value={form.transformation.rotationOriginX} readOnly />
        <input type="hidden" value={form.transformation.rotationOriginY} readOnly />
        <input type="hidden" value={form.transformation.dE} readOnly />
        <input type="hidden" value={form.transformation.dN} readOnly />
        <input type="hidden" value={form.transformation.rotation} readOnly />
        <input type="hidden" value={form.transformation.scalePpm} readOnly />
        <input type="hidden" value={form.heightTransformation.commonPoints} readOnly />
        <input type="hidden" value={form.heightTransformation.meanAccuracy} readOnly />
        <input type="hidden" value={form.heightTransformation.inclinationX} readOnly />
        <input type="hidden" value={form.heightTransformation.inclinationY} readOnly />
        <input type="hidden" value={form.heightTransformation.parameters} readOnly />
      </section>

      <section className="card p-5">
        <h2 className="mb-1 text-sm font-bold uppercase tracking-wide text-slate-500">
          Double-polar tolerances
        </h2>
        <p className="mb-4 text-xs text-slate-400">
          A survey point is flagged <span className="font-semibold text-red-600">Limit exceeded</span> when the
          spread between its two independent observations breaks these limits.
        </p>
        <label className="mb-4 flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={form.includeHeight}
            onChange={(e) => set("includeHeight", e.target.checked)}
          />
          Include height (capture &amp; check ellipsoidal/ortho height on survey points)
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Average limit — Position (m)">
            <input type="number" step="0.0001" className="input num" value={form.positionLimit} onChange={(e) => set("positionLimit", e.target.value)} />
          </Field>
          {form.includeHeight && (
            <Field label="Average limit — Height (m)">
              <input type="number" step="0.0001" className="input num" value={form.heightLimit} onChange={(e) => set("heightLimit", e.target.value)} />
            </Field>
          )}
        </div>

        <div className="mt-4 border-t border-slate-100 pt-4">
          <span className="label">Coordinates decimal places (field book report)</span>
          <p className="mb-2 text-[11px] text-slate-400">
            How many decimal places Easting/Northing/Height/CQ are shown to in the printed report.
          </p>
          <div className="flex items-center gap-5 text-sm text-slate-700">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="coordDecimals"
                checked={form.coordDecimals !== 3}
                onChange={() => set("coordDecimals", 4)}
              />
              4 decimal places
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="coordDecimals"
                checked={form.coordDecimals === 3}
                onChange={() => set("coordDecimals", 3)}
              />
              3 decimal places
            </label>
          </div>
        </div>

        <div className="mt-4 border-t border-slate-100 pt-4">
          <Field label="Minimum time difference — between observations (min)" full>
            <p className="mb-2 text-[11px] text-slate-400">
              Enter the minimum time gap required between a point&apos;s two double-polar observations.
              Choose any interval based on your survey type (e.g., minutes for a small plot, ~60 min for a farm).
            </p>
            <input
              type="number"
              step="1"
              min="0"
              className="input num"
              value={form.minTimeDiffMinutes}
              onChange={(e) => set("minTimeDiffMinutes", e.target.value)}
              placeholder="e.g., 25"
            />
          </Field>
        </div>
      </section>

      <div className="flex items-center gap-3">
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? "Saving…" : jobId ? "Save changes" : "Create job"}
        </button>
        <button type="button" className="btn-secondary" onClick={() => router.back()}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function Field({ label, children, full }) {
  const id = useId();
  const input =
    isValidElement(children) && children.props.id == null
      ? cloneElement(children, { id })
      : children;
  return (
    <div className={full ? "sm:col-span-2" : ""}>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      {input}
    </div>
  );
}

function numOrNull(v) {
  if (v === "" || v === null || v === undefined) return null;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

// Parse "DD/MM/YYYY[ HH:MM[:SS]]" (or anything Date understands) → Date, else null.
function parseDateTime(s) {
  if (!s) return null;
  const m = String(s).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) {
    const [, dd, mm, yyyy, h = "0", mi = "0", se = "0"] = m;
    const d = new Date(+yyyy, +mm - 1, +dd, +h, +mi, +se);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function fmtDateTime(d) {
  const p = (x) => String(x).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

// Build the six editable parts from a stored value in EITHER supported format —
// "DD/MM/YYYY HH:MM:SS" or a native datetime-local "YYYY-MM-DDTHH:MM" (older
// jobs) — so the calibration boxes populate correctly regardless of origin.
function partsFromAny(s) {
  const d = parseDateTime(s);
  if (!d) return { dd: "", mm: "", yyyy: "", hh: "", mi: "", ss: "" };
  const p = (x) => String(x).padStart(2, "0");
  return {
    dd: p(d.getDate()),
    mm: p(d.getMonth() + 1),
    yyyy: String(d.getFullYear()),
    hh: p(d.getHours()),
    mi: p(d.getMinutes()),
    ss: p(d.getSeconds()),
  };
}

// Split a stored "DD/MM/YYYY HH:MM:SS" string into the six editable parts.
function parseDateParts(s) {
  const m = String(s || "").match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (!m) return { dd: "", mm: "", yyyy: "", hh: "", mi: "", ss: "" };
  return { dd: m[1], mm: m[2], yyyy: m[3], hh: m[4] || "", mi: m[5] || "", ss: m[6] || "" };
}

// Combine the six parts into "DD/MM/YYYY HH:MM:SS" — empty until all are filled.
function combineDateParts({ dd, mm, yyyy, hh, mi, ss }) {
  if ([dd, mm, yyyy, hh, mi, ss].some((v) => v === "" || v == null)) return "";
  const p2 = (x) => String(x).padStart(2, "0");
  return `${p2(dd)}/${p2(mm)}/${yyyy} ${p2(hh)}:${p2(mi)}:${p2(ss)}`;
}

// Validate the date/time boxes — returns an error message, or "" when valid.
function dateTimeError({ dd, mm, yyyy, hh, mi, ss }) {
  if ([dd, mm, yyyy, hh, mi, ss].some((v) => v === "" || v == null))
    return "Job created date & time is required — fill DD, MM, YYYY, Hrs, Min and Sec.";
  if (yyyy.length !== 4 || +yyyy < 1900 || +yyyy > 2999) return "Enter a 4-digit year.";
  if (+mm < 1 || +mm > 12) return "Month must be between 01 and 12.";
  if (+dd < 1 || +dd > 31) return "Day must be between 01 and 31.";
  if (+hh > 23) return "Hours must be between 00 and 23.";
  if (+mi > 59) return "Minutes must be between 00 and 59.";
  if (+ss > 59) return "Seconds must be between 00 and 59.";
  return "";
}

// One small numeric box (Day / Month / Year / Hrs / Min / Sec) with its label.
function DtBox({ label, value, onChange, max, w, ph }) {
  return (
    <div className={`flex flex-col ${w}`}>
      <span className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</span>
      <input
        className="input num text-center !px-2"
        inputMode="numeric"
        value={value}
        maxLength={max}
        placeholder={ph}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}