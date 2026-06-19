"use client";

import { useMemo, useState } from "react";
import { api } from "@/lib/api";
import { parsePastedRows, pairPolars } from "@/lib/csv";
import { computeSurveyPoint, fmt } from "@/lib/survey";
import StatusBadge from "@/components/StatusBadge";
import { useToast } from "@/components/Toast";

const COLUMN_PRESETS = [
  "name,easting,northing",
  "name,easting,northing,height",
  "name,code,easting,northing",
  "name,easting,northing,height,sdE,sdN,sdHgt",
];

export default function BulkImport({ jobId, limits, includeHeight, onImported, onCancel }) {
  const toast = useToast();
  const [columnSpec, setColumnSpec] = useState(
    includeHeight ? "name,easting,northing,height" : "name,easting,northing"
  );
  const [firstRef, setFirstRef] = useState("");
  const [secondRef, setSecondRef] = useState("");
  const [firstText, setFirstText] = useState("");
  const [secondText, setSecondText] = useState("");
  const [overwrite, setOverwrite] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  const columns = useMemo(
    () => columnSpec.split(",").map((c) => c.trim()).filter(Boolean),
    [columnSpec]
  );

  const parsed = useMemo(() => {
    const first = parsePastedRows(firstText, columns);
    const second = parsePastedRows(secondText, columns);
    const points = pairPolars(first.rows, second.rows, firstRef || "Polar 1", secondRef || "Polar 2");
    const preview = points.map((p) => ({
      ...p,
      computed: computeSurveyPoint(p.observations, limits || {}),
    }));
    return { preview, errors: [...first.errors, ...second.errors] };
  }, [firstText, secondText, columns, firstRef, secondRef, limits]);

  const exceededCount = parsed.preview.filter((p) => p.computed.limitExceeded).length;

  async function doImport() {
    if (!parsed.preview.length) {
      setError("Nothing to import — paste some rows first.");
      return;
    }
    setImporting(true);
    setError("");
    setResult(null);
    try {
      const res = await api.post(`/api/jobs/${jobId}/survey/import`, {
        overwrite,
        points: parsed.preview.map(({ name, code, observations }) => ({ name, code, observations })),
      });
      setResult(res);
      const parts = [];
      if (res.created) parts.push(`${res.created} created`);
      if (res.updated) parts.push(`${res.updated} updated`);
      if (res.skipped?.length) parts.push(`${res.skipped.length} skipped`);
      toast.success(`Import complete — ${parts.join(", ") || "no changes"}.`);
      onImported?.();
    } catch (err) {
      setError(err.message);
      toast.error(err.message);
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="card p-5">
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">
            Paste import (double polar)
          </h2>
          <p className="mt-1 text-xs text-slate-400">
            Paste the machine CSV for each polar. Points are matched by name and the mean +
            differences are computed automatically — no manual re-typing.
          </p>
        </div>
        {onCancel && (
          <button type="button" className="btn-ghost !py-1 !text-xs" onClick={onCancel}>
            Close
          </button>
        )}
      </div>

      {/* Column spec */}
      <div className="mb-4">
        <label className="label">Column order (matches your CSV columns)</label>
        <input className="input num" value={columnSpec} onChange={(e) => setColumnSpec(e.target.value)} />
        <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
          <span>Tokens: name, code, easting, northing, height, sdE, sdN, sdHgt, ignore.</span>
          {COLUMN_PRESETS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setColumnSpec(p)}
              className="rounded border border-slate-200 px-1.5 py-0.5 font-mono hover:bg-slate-50"
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Two polar paste areas */}
      <div className="grid gap-4 lg:grid-cols-2">
        <PolarBox
          title="First polar"
          refValue={firstRef}
          onRef={setFirstRef}
          text={firstText}
          onText={setFirstText}
        />
        <PolarBox
          title="Second polar"
          refValue={secondRef}
          onRef={setSecondRef}
          text={secondText}
          onText={setSecondText}
        />
      </div>

      {/* Parse errors */}
      {parsed.errors.length > 0 && (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
          {parsed.errors.slice(0, 6).map((e, i) => (
            <div key={i}>{e}</div>
          ))}
          {parsed.errors.length > 6 && <div>…and {parsed.errors.length - 6} more</div>}
        </div>
      )}

      {/* Preview */}
      {parsed.preview.length > 0 && (
        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">
              Preview — {parsed.preview.length} point{parsed.preview.length === 1 ? "" : "s"}
            </h3>
            {exceededCount > 0 && (
              <span className="badge bg-red-100 text-red-700">
                {exceededCount} exceed the limit — check for typos
              </span>
            )}
          </div>
          <div className="max-h-72 overflow-auto rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-50">
                <tr className="text-left text-xs uppercase text-slate-400">
                  <th className="px-3 py-2 font-semibold">Point</th>
                  <th className="px-3 py-2 text-center font-semibold">Obs</th>
                  <th className="px-3 py-2 text-right font-semibold">Mean E</th>
                  <th className="px-3 py-2 text-right font-semibold">Mean N</th>
                  <th className="px-3 py-2 text-right font-semibold">Posn diff</th>
                  <th className="px-3 py-2 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {parsed.preview.map((p) => (
                  <tr key={p.name} className="border-t border-slate-100">
                    <td className="px-3 py-1.5 font-medium text-slate-800">{p.name}</td>
                    <td className="px-3 py-1.5 text-center text-slate-600">{p.computed.observationCount}</td>
                    <td className="num px-3 py-1.5 text-right text-slate-600">{fmt(p.computed.meanEasting)}</td>
                    <td className="num px-3 py-1.5 text-right text-slate-600">{fmt(p.computed.meanNorthing)}</td>
                    <td className={`num px-3 py-1.5 text-right ${p.computed.positionExceeded ? "font-semibold text-red-600" : "text-slate-600"}`}>
                      {fmt(p.computed.positionDiff)}
                    </td>
                    <td className="px-3 py-1.5">
                      <StatusBadge computed={p.computed} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {error && (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}
      {result && (
        <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          Imported: {result.created} created, {result.updated} updated
          {result.skipped?.length ? `, ${result.skipped.length} skipped (already exist)` : ""}.
        </div>
      )}

      <div className="mt-4 flex items-center gap-3">
        <button type="button" className="btn-primary" onClick={doImport} disabled={importing}>
          {importing ? "Importing…" : `Import ${parsed.preview.length || ""} point${parsed.preview.length === 1 ? "" : "s"}`}
        </button>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} />
          Overwrite existing points with the same name
        </label>
      </div>
    </div>
  );
}

function PolarBox({ title, refValue, onRef, text, onText }) {
  function onFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => onText(String(reader.result || ""));
    reader.readAsText(file);
    e.target.value = ""; // allow re-selecting the same file
  }
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-slate-500">{title}</span>
        <input
          className="input !w-40 !py-1 text-xs"
          placeholder="Reference (e.g. MTRM4)"
          value={refValue}
          onChange={(e) => onRef(e.target.value)}
        />
      </div>
      <label className="mb-2 flex items-center gap-2 text-xs text-slate-500">
        <span className="font-medium text-brand-600">📄 Upload CSV file</span>
        <input type="file" accept=".csv,.txt" onChange={onFile} className="text-xs" />
        <span className="text-slate-400">or paste below ↓</span>
      </label>
      <textarea
        className="input num h-40 font-mono text-xs"
        placeholder={"M1, 96991.1062, 2715175.4782\nM2, 97033.6750, 2715170.8772"}
        value={text}
        onChange={(e) => onText(e.target.value)}
      />
    </div>
  );
}
