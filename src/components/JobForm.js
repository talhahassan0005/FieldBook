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
  timezone: "",
  applicationSoftware: "",
  firmwareVersion: "",
  codelistName: "",
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

  useEffect(() => {
    api.get("/api/coordinate-systems").then(setCoordSystems).catch(() => {});
  }, []);

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  // When a known coordinate system is chosen, auto-fill its calibration fields
  // (transformation + metadata) — "entered once per system, reused by every job".
  function applyCoordSystem(sys) {
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
  function setTransform(field, value) {
    setForm((f) => ({ ...f, transformation: { ...f.transformation, [field]: value } }));
  }
  function setHeightTransform(field, value) {
    setForm((f) => ({ ...f, heightTransformation: { ...f.heightTransformation, [field]: value } }));
  }

  function onLogoFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 500 * 1024) {
      setError("Logo image is too large (max 500 KB). Please use a smaller image.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => set("logoUrl", reader.result);
    reader.readAsDataURL(file);
  }

  async function submit(e) {
    e.preventDefault();
    if (!form.name.trim()) {
      setError("Job name is required");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const payload = {
        ...form,
        positionLimit: parseFloat(form.positionLimit) || 0.05,
        heightLimit: parseFloat(form.heightLimit) || 0.075,
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
        <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-slate-500">
          Job information
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Job name *">
            <input className="input" required aria-required="true" value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="MATEBELE2022" />
          </Field>
          <Field label="Creator / surveyor">
            <input className="input" value={form.creator} onChange={(e) => set("creator", e.target.value)} placeholder="BISM" />
          </Field>
          <Field label="Job created (date/time)">
            <input className="input" value={form.jobCreated} onChange={(e) => set("jobCreated", e.target.value)} placeholder="10/06/2022 07:54:48" />
          </Field>
          <Field label="Company / firm (report header)">
            <input className="input" value={form.company} onChange={(e) => set("company", e.target.value)} placeholder="Your survey firm" />
          </Field>
          <Field label="Description" full>
            <input className="input" value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="CAD / cadastral survey" />
          </Field>
          <Field label="Time zone">
            <input className="input" value={form.timezone} onChange={(e) => set("timezone", e.target.value)} placeholder="2h 00'" />
          </Field>
          <Field label="Application software">
            <input className="input" value={form.applicationSoftware} onChange={(e) => set("applicationSoftware", e.target.value)} placeholder="LEICA Geo Office 7.0" />
          </Field>
          <Field label="Firmware version">
            <input className="input" value={form.firmwareVersion} onChange={(e) => set("firmwareVersion", e.target.value)} placeholder="5.60" />
          </Field>
          <div className="sm:col-span-2">
            <label className="label">Company logo (shown on the report) — optional</label>
            <div className="flex items-center gap-3">
              {form.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={form.logoUrl} alt="logo" loading="lazy" className="h-12 w-auto rounded border border-slate-200 bg-white p-1" />
              ) : (
                <span className="text-xs text-slate-400">No logo</span>
              )}
              <input type="file" accept="image/*" onChange={onLogoFile} className="text-sm" />
              {form.logoUrl && (
                <button type="button" className="text-xs text-red-600 hover:underline" onClick={() => set("logoUrl", "")}>
                  Remove
                </button>
              )}
            </div>
          </div>
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
          <Field label="Transformation name (auto)">
            <input className="input bg-slate-50 text-slate-500" value={form.transformationName} readOnly tabIndex={-1} placeholder="(same as coordinate system name)" />
          </Field>
          <Field label="Transformation type (default)">
            <input className="input bg-slate-50 text-slate-500" value={form.transformationType || "Twostep"} readOnly tabIndex={-1} />
          </Field>
          <Field label="Pre-transformation name">
            <input className="input" value={form.preTransformationName} onChange={(e) => set("preTransformationName", e.target.value)} placeholder="DSM_BNGR_To_BTRS" />
          </Field>
          <Field label="Residuals formula">
            <input className="input" value={form.residualsFormula} onChange={(e) => set("residualsFormula", e.target.value)} placeholder="1 / ( distance^2 )" />
          </Field>
          <Field label="Local ellipsoid">
            <input className="input" value={form.ellipsoid} onChange={(e) => set("ellipsoid", e.target.value)} placeholder="Clarke 1880" />
          </Field>
          <Field label="Projection / LO">
            <input
              className="input"
              list="lo-options"
              value={form.projection}
              onChange={(e) => set("projection", e.target.value)}
              placeholder="LO27 / TM27"
            />
            <datalist id="lo-options">
              {LO_OPTIONS.map((lo) => (
                <option key={lo} value={lo} />
              ))}
            </datalist>
          </Field>
          <Field label="Height mode">
            <input className="input" value={form.heightMode} onChange={(e) => set("heightMode", e.target.value)} placeholder="Orthometric" />
          </Field>
          <Field label="Coordinate system created">
            <input className="input" value={form.coordinateSystemCreated} onChange={(e) => set("coordinateSystemCreated", e.target.value)} placeholder="08/24/2018 11:37:24" />
          </Field>
          <Field label="Geoid model">
            <input className="input" value={form.geoidModel} onChange={(e) => set("geoidModel", e.target.value)} placeholder="-" />
          </Field>
          <Field label="CSCS model">
            <input className="input" value={form.cscsModel} onChange={(e) => set("cscsModel", e.target.value)} placeholder="-" />
          </Field>
        </div>

        <h3 className="mb-2 mt-5 text-xs font-bold uppercase tracking-wide text-slate-400">
          2D-Helmert transformation
        </h3>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Number of common points">
            <input className="input num" value={form.transformation.commonPoints} onChange={(e) => setTransform("commonPoints", e.target.value)} placeholder="4" />
          </Field>
          <Field label="Rotation origin X0 (m)">
            <input className="input num" value={form.transformation.rotationOriginX} onChange={(e) => setTransform("rotationOriginX", e.target.value)} placeholder="-0.0041" />
          </Field>
          <Field label="Rotation origin Y0 (m)">
            <input className="input num" value={form.transformation.rotationOriginY} onChange={(e) => setTransform("rotationOriginY", e.target.value)} placeholder="-0.0047" />
          </Field>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-4">
          <Field label="dE (m)">
            <input className="input num" value={form.transformation.dE} onChange={(e) => setTransform("dE", e.target.value)} placeholder="2370216.5416" />
          </Field>
          <Field label="dN (m)">
            <input className="input num" value={form.transformation.dN} onChange={(e) => setTransform("dN", e.target.value)} placeholder="-47706.6053" />
          </Field>
          <Field label="Rotation">
            <input className="input num" value={form.transformation.rotation} onChange={(e) => setTransform("rotation", e.target.value)} placeholder="-179°49'43.18702&quot;" />
          </Field>
          <Field label="Scale (ppm)">
            <input className="input num" value={form.transformation.scalePpm} onChange={(e) => setTransform("scalePpm", e.target.value)} placeholder="-4.1346" />
          </Field>
        </div>

        <h3 className="mb-2 mt-5 text-xs font-bold uppercase tracking-wide text-slate-400">
          Height transformation
        </h3>
        <div className="grid gap-4 sm:grid-cols-4">
          <Field label="Number of common points">
            <input className="input num" value={form.heightTransformation.commonPoints} onChange={(e) => setHeightTransform("commonPoints", e.target.value)} placeholder="0" />
          </Field>
          <Field label="Mean accuracy (m)">
            <input className="input num" value={form.heightTransformation.meanAccuracy} onChange={(e) => setHeightTransform("meanAccuracy", e.target.value)} placeholder="0.0000" />
          </Field>
          <Field label="Inclination X">
            <input className="input num" value={form.heightTransformation.inclinationX} onChange={(e) => setHeightTransform("inclinationX", e.target.value)} placeholder="0° 00' 00.00000&quot;" />
          </Field>
          <Field label="Inclination Y">
            <input className="input num" value={form.heightTransformation.inclinationY} onChange={(e) => setHeightTransform("inclinationY", e.target.value)} placeholder="0° 00' 00.00000&quot;" />
          </Field>
          <Field label="Parameters" full>
            <input className="input num" value={form.heightTransformation.parameters} onChange={(e) => setHeightTransform("parameters", e.target.value)} placeholder="0.00000000  0.00000000  0.0000 m" />
          </Field>
        </div>
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
