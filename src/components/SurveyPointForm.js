"use client";

import { useMemo, useState, useId, isValidElement, cloneElement } from "react";
import { api } from "@/lib/api";
import { computeSurveyPoint, fmt } from "@/lib/survey";
import StatusBadge from "@/components/StatusBadge";
import { useToast } from "@/components/Toast";

function emptyObs() {
  return {
    reference: "",
    dateTime: "",
    easting: "",
    northing: "",
    height: "",
    sdE: "",
    sdN: "",
    sdHgt: "",
    sdSlope: "",
    posnDiffOverride: "",
    hgtDiffOverride: "",
  };
}

export default function SurveyPointForm({
  jobId,
  controlPoints = [],
  limits,
  includeHeight = false,
  initial,
  onSaved,
  onCancel,
}) {
  const toast = useToast();
  const [name, setName] = useState(initial?.name ?? "");
  const [code, setCode] = useState(initial?.code ?? "");
  const [observations, setObservations] = useState(
    initial?.observations?.length
      ? initial.observations.map((o) => ({
          reference: o.reference ?? "",
          dateTime: o.dateTime ?? "",
          easting: o.easting ?? "",
          northing: o.northing ?? "",
          height: o.height ?? "",
          sdE: o.sdE ?? "",
          sdN: o.sdN ?? "",
          sdHgt: o.sdHgt ?? "",
          sdSlope: o.sdSlope ?? "",
          posnDiffOverride: o.posnDiffOverride ?? "",
          hgtDiffOverride: o.hgtDiffOverride ?? "",
        }))
      : [emptyObs(), emptyObs()] // default: two observations for double polar
  );
  const [cqOverride, setCqOverride] = useState(initial?.cqOverride ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Live double-polar computation preview (with any manual overrides applied).
  const preview = useMemo(
    () => computeSurveyPoint(observations, limits || {}, { cqOverride }),
    [observations, limits, cqOverride]
  );
  // Auto-computed values (no overrides) — used as placeholders / hints.
  const auto = useMemo(
    () => computeSurveyPoint(observations.map((o) => ({ ...o, posnDiffOverride: "", hgtDiffOverride: "" })), limits || {}),
    [observations, limits]
  );

  function setObs(i, field, value) {
    setObservations((list) => list.map((o, idx) => (idx === i ? { ...o, [field]: value } : o)));
  }
  function addObs() {
    setObservations((list) => [...list, emptyObs()]);
  }
  function removeObs(i) {
    setObservations((list) => (list.length <= 1 ? list : list.filter((_, idx) => idx !== i)));
  }

  async function submit(e) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Point name is required");
      return;
    }
    setSaving(true);
    setError("");
    const payload = {
      name: name.trim(),
      code,
      cqOverride: num(cqOverride),
      observations: observations.map((o) => ({
        reference: o.reference,
        dateTime: o.dateTime,
        easting: num(o.easting),
        northing: num(o.northing),
        height: num(o.height),
        sdE: num(o.sdE),
        sdN: num(o.sdN),
        sdHgt: num(o.sdHgt),
        sdSlope: num(o.sdSlope),
        posnDiffOverride: num(o.posnDiffOverride),
        hgtDiffOverride: num(o.hgtDiffOverride),
      })),
    };
    try {
      if (initial?._id) {
        await api.put(`/api/survey/${initial._id}`, payload);
        toast.success(`Point "${payload.name}" updated.`);
      } else {
        await api.post(`/api/jobs/${jobId}/survey`, payload);
        toast.success(`Point "${payload.name}" saved.`);
      }
      onSaved?.();
    } catch (err) {
      setError(err.message);
      toast.error(err.message);
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="card p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">
          {initial?._id ? `Edit point ${initial.name}` : "New survey point"}
        </h2>
        {onCancel && (
          <button type="button" className="btn-ghost !py-1 !text-xs" onClick={onCancel}>
            Close
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <Field label="Point name *">
          <input className="input" required aria-required="true" value={name} onChange={(e) => setName(e.target.value)} placeholder="M1" />
        </Field>
        <Field label="Feature code">
          <input className="input" value={code} onChange={(e) => setCode(e.target.value)} placeholder="beacon / corner" />
        </Field>
      </div>

      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">
          Observations (double polar = 2 references)
        </h3>
        <button type="button" className="btn-secondary !py-1 !text-xs" onClick={addObs}>
          + Add observation
        </button>
      </div>

      <div className="space-y-3">
        {observations.map((o, i) => (
          <div key={i} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500">Observation {i + 1}</span>
              {observations.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeObs(i)}
                  className="text-xs text-slate-400 hover:text-red-600"
                >
                  Remove
                </button>
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Reference">
                <input
                  className="input"
                  list={`refs-${jobId}`}
                  value={o.reference}
                  onChange={(e) => setObs(i, "reference", e.target.value)}
                  placeholder="MTRM4"
                />
              </Field>
              <Field label="Date / time">
                <input
                  className="input"
                  value={o.dateTime}
                  onChange={(e) => setObs(i, "dateTime", e.target.value)}
                  placeholder="10/06/2022 08:51:39"
                />
              </Field>
              <Field label="Easting (m)">
                <input className="input num" value={o.easting} onChange={(e) => setObs(i, "easting", e.target.value)} />
              </Field>
              <Field label="Northing (m)">
                <input className="input num" value={o.northing} onChange={(e) => setObs(i, "northing", e.target.value)} />
              </Field>
              {includeHeight && (
                <Field label="Height (m)">
                  <input className="input num" value={o.height} onChange={(e) => setObs(i, "height", e.target.value)} />
                </Field>
              )}
              <Field label="Sd.E">
                <input className="input num" value={o.sdE} onChange={(e) => setObs(i, "sdE", e.target.value)} placeholder="optional" />
              </Field>
              <Field label="Sd.N">
                <input className="input num" value={o.sdN} onChange={(e) => setObs(i, "sdN", e.target.value)} placeholder="optional" />
              </Field>
              <Field label="Sd.Hgt">
                <input className="input num" value={o.sdHgt} onChange={(e) => setObs(i, "sdHgt", e.target.value)} placeholder="optional" />
              </Field>
              <Field label="Sd.Slope">
                <input className="input num" value={o.sdSlope} onChange={(e) => setObs(i, "sdSlope", e.target.value)} placeholder="optional" />
              </Field>
            </div>
          </div>
        ))}
      </div>

      {/* control point names for the datalist */}
      <datalist id={`refs-${jobId}`}>
        {controlPoints.map((c) => (
          <option key={c._id} value={c.name} />
        ))}
      </datalist>

      {/* Optional: edit the report's CQ & per-observation differences */}
      <details className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-slate-500">
          Report values — CQ &amp; differences (optional override)
        </summary>
        <p className="mt-2 text-[11px] text-slate-400">
          Leave blank to use the auto-computed value (shown as the placeholder). Fill in to set the
          exact figure that appears on the field book.
        </p>
        <div className="mt-3 max-w-xs">
          <Field label="CQ (m)">
            <input
              className="input num"
              value={cqOverride}
              onChange={(e) => setCqOverride(e.target.value)}
              placeholder={fmt(auto.cq)}
            />
          </Field>
        </div>
        <div className="mt-3 space-y-2">
          {observations.map((o, i) => (
            <div key={i} className="grid gap-3 sm:grid-cols-3">
              <div className="self-center text-xs font-semibold text-slate-500">
                Obs {i + 1}{o.reference ? ` · ${o.reference}` : ""}
              </div>
              <Field label="Posn. diff (m)">
                <input
                  className="input num"
                  value={o.posnDiffOverride}
                  onChange={(e) => setObs(i, "posnDiffOverride", e.target.value)}
                  placeholder={fmt(auto.perObservation?.[i]?.deviationPosn)}
                />
              </Field>
              <Field label="Hgt. diff (m)">
                <input
                  className="input num"
                  value={o.hgtDiffOverride}
                  onChange={(e) => setObs(i, "hgtDiffOverride", e.target.value)}
                  placeholder={fmt(auto.perObservation?.[i]?.deviationHgt)}
                />
              </Field>
            </div>
          ))}
        </div>
      </details>

      {/* Live preview */}
      <div className="mt-5 rounded-lg border border-brand-100 bg-brand-50 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wide text-brand-700">
            Double-polar result (live)
          </h3>
          <StatusBadge computed={preview} />
        </div>
        <div className="grid gap-3 text-sm sm:grid-cols-3 lg:grid-cols-6">
          <Metric label="Mean E" value={fmt(preview.meanEasting)} />
          <Metric label="Mean N" value={fmt(preview.meanNorthing)} />
          {includeHeight && <Metric label="Mean Hgt" value={fmt(preview.meanHeight)} />}
          <Metric
            label="Posn diff"
            value={fmt(preview.positionDiff)}
            bad={preview.positionExceeded}
            limit={`≤ ${preview.positionLimit}`}
          />
          {includeHeight && (
            <Metric
              label="Hgt diff"
              value={fmt(preview.heightDiff)}
              bad={preview.heightExceeded}
              limit={`≤ ${preview.heightLimit}`}
            />
          )}
          <Metric label="CQ" value={fmt(preview.cq)} />
          {preview.timeDiffMinutes !== null && (
            <Metric
              label="Time diff"
              value={fmt(preview.timeDiffMinutes, 0)}
              bad={preview.timeDiffExceeded}
              limit={`≥ ${preview.minTimeDiffMinutes}`}
              unit="min"
            />
          )}
        </div>
        {preview.duplicateObservation && (
          <p className="mt-3 text-xs font-medium text-red-600">
            ⚠ Two observations have identical Easting/Northing — the second polar looks like it was
            pasted from the first. Re-check the source data for this point.
          </p>
        )}
        {preview.workingHoursExceeded && (
          <p className="mt-3 text-xs font-medium text-red-600">
            ⚠ One or more observations are timestamped outside working hours (06:00–18:00) — check the
            date/time entered for this point.
          </p>
        )}
        {preview.limitExceeded && !preview.duplicateObservation && !preview.workingHoursExceeded && (
          <p className="mt-3 text-xs font-medium text-red-600">
            {preview.timeDiffExceeded && !preview.positionExceeded && !preview.heightExceeded
              ? "⚠ The two observations were taken too close together in time — re-survey with a longer gap between them."
              : "⚠ The two observations disagree beyond the tolerance — this point should be re-surveyed."}
          </p>
        )}
      </div>

      <div className="mt-5 flex gap-2">
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? "Saving…" : initial?._id ? "Save changes" : "Save point"}
        </button>
        {onCancel && (
          <button type="button" className="btn-secondary" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

function Metric({ label, value, bad, limit, unit = "m" }) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</div>
      <div className={`num text-base font-semibold ${bad ? "text-red-600" : "text-slate-800"}`}>
        {value}
      </div>
      {limit && <div className="text-[10px] text-slate-400">{limit} {unit}</div>}
    </div>
  );
}

function Field({ label, children }) {
  const id = useId();
  const input =
    isValidElement(children) && children.props.id == null
      ? cloneElement(children, { id })
      : children;
  return (
    <div>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      {input}
    </div>
  );
}

function num(v) {
  if (v === "" || v === null || v === undefined) return null;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}
