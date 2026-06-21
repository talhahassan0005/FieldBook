"use client";

import { useMemo, useState } from "react";
import { api } from "@/lib/api";
import { parsePastedRows, pairPolars, classifyPointKind } from "@/lib/csv";
import { computeSurveyPoint, fmt } from "@/lib/survey";
import StatusBadge from "@/components/StatusBadge";
import { useToast } from "@/components/Toast";

const COLUMN_PRESETS = [
  "name,easting,northing",
  "name,easting,northing,code",
  "name,easting,northing,height",
  "name,code,easting,northing",
  "name,easting,northing,height,sdE,sdN,sdHgt",
];

export default function BulkImport({ jobId, limits, includeHeight, onImported, onCancel }) {
  const toast = useToast();
  const [mode, setMode] = useState("single"); // "single" or "polar"
  const [columnSpec, setColumnSpec] = useState(
    includeHeight ? "name,easting,northing,height" : "name,easting,northing"
  );
  const [singleRef, setSingleRef] = useState("");
  const [singleText, setSingleText] = useState("");
  const [firstRef, setFirstRef] = useState("");
  const [secondRef, setSecondRef] = useState("");
  const [firstText, setFirstText] = useState("");
  const [secondText, setSecondText] = useState("");
  const [overwrite, setOverwrite] = useState(false);
  const [autoSplit, setAutoSplit] = useState(true); // route reference marks → control points
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  const columns = useMemo(
    () => columnSpec.split(",").map((c) => c.trim()).filter(Boolean),
    [columnSpec]
  );

  const parsed = useMemo(() => {
    if (mode === "single") {
      const { rows, errors } = parsePastedRows(singleText, columns);
      // Group by point name: a name that repeats = the SAME point measured more
      // than once = double polar. Order is preserved (Map keeps insertion order).
      const groups = new Map();
      for (const row of rows) {
        if (!groups.has(row.name)) groups.set(row.name, []);
        groups.get(row.name).push(row);
      }
      const surveyPreview = [];
      const controlPreview = [];
      for (const [name, groupRows] of groups) {
        const first = groupRows[0];
        // Auto-split: reference marks (WP/BRM/IPC…) become control points.
        if (autoSplit && classifyPointKind(first) === "control") {
          controlPreview.push({
            name,
            code: first.code || "",
            pointType: "Position",
            easting: first.easting,
            northing: first.northing,
            height: first.height ?? null,
          });
          continue;
        }
        // One observation per row. A repeated name → multiple observations
        // (double polar). Use the row's own reference column if present, else
        // label them Polar 1 / Polar 2…; a single-obs point keeps the typed ref.
        const multi = groupRows.length > 1;
        const observations = groupRows.map((row, i) => ({
          reference: row.reference || (multi ? `Polar ${i + 1}` : singleRef || "STN"),
          dateTime: row.dateTime || "",
          easting: row.easting,
          northing: row.northing,
          height: row.height ?? null,
          sdE: row.sdE ?? null,
          sdN: row.sdN ?? null,
          sdHgt: row.sdHgt ?? null,
        }));
        surveyPreview.push({
          name,
          code: first.code || "",
          observations,
          computed: computeSurveyPoint(observations, limits || {}),
        });
      }
      return { surveyPreview, controlPreview, errors };
    } else {
      const first = parsePastedRows(firstText, columns);
      const second = parsePastedRows(secondText, columns);
      const points = pairPolars(first.rows, second.rows, firstRef || "Polar 1", secondRef || "Polar 2");
      const surveyPreview = points.map((p) => ({
        ...p,
        computed: computeSurveyPoint(p.observations, limits || {}),
      }));
      return { surveyPreview, controlPreview: [], errors: [...first.errors, ...second.errors] };
    }
  }, [mode, singleText, singleRef, firstText, secondText, columns, firstRef, secondRef, limits, autoSplit]);

  const exceededCount = parsed.surveyPreview.filter((p) => p.computed.limitExceeded).length;
  const totalCount = parsed.surveyPreview.length + parsed.controlPreview.length;

  async function doImport() {
    if (!totalCount) {
      setError("Nothing to import — paste some rows first.");
      return;
    }
    setImporting(true);
    setError("");
    setResult(null);
    try {
      let survey = null;
      let controlRes = null;

      if (parsed.surveyPreview.length) {
        survey = await api.post(`/api/jobs/${jobId}/survey/import`, {
          overwrite,
          points: parsed.surveyPreview.map(({ name, code, observations }) => ({
            name,
            code,
            observations,
          })),
        });
      }
      if (parsed.controlPreview.length) {
        controlRes = await api.post(`/api/jobs/${jobId}/control/import`, {
          overwrite,
          points: parsed.controlPreview,
        });
      }

      setResult({ survey, control: controlRes });
      const parts = [];
      const s = survey || {};
      const c = controlRes || {};
      const created = (s.created || 0) + (c.created || 0);
      const updated = (s.updated || 0) + (c.updated || 0);
      const skipped = (s.skipped?.length || 0) + (c.skipped?.length || 0);
      if (created) parts.push(`${created} created`);
      if (updated) parts.push(`${updated} updated`);
      if (skipped) parts.push(`${skipped} skipped`);
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
            {mode === "single" ? "Import CSV (single file)" : "Paste import (double polar)"}
          </h2>
          <p className="mt-1 text-xs text-slate-400">
            {mode === "single"
              ? "Upload one CSV / paste below. Repeated point names are paired into double-polar observations; reference marks (WP/BRM/IPC…) are auto-routed to control points."
              : "Paste the machine CSV for each polar. Points are matched by name and the mean + differences are computed automatically."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {onCancel && (
            <button type="button" className="btn-ghost !py-1 !text-xs" onClick={onCancel}>
              Close
            </button>
          )}
        </div>
      </div>

      {/* Mode toggle */}
      <div className="mb-4 flex items-center gap-3 border-b border-slate-200 pb-3">
        <button
          type="button"
          onClick={() => setMode("single")}
          className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
            mode === "single"
              ? "bg-brand-600 text-white"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          Single CSV / paste
        </button>
        <button
          type="button"
          onClick={() => setMode("polar")}
          className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
            mode === "polar"
              ? "bg-brand-600 text-white"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          Double polar (2 files)
        </button>
      </div>

      {/* Column spec */}
      <div className="mb-4">
        <label className="label">Column order (matches your CSV columns)</label>
        <input className="input num" value={columnSpec} onChange={(e) => setColumnSpec(e.target.value)} />
        <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
          <span>Tokens: name, code, easting, northing, height, sdE, sdN, sdHgt, reference, ignore.</span>
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

      {/* Paste area: single mode or double-polar mode */}
      {mode === "single" ? (
        <>
          <SingleBox
            refValue={singleRef}
            onRef={setSingleRef}
            text={singleText}
            onText={setSingleText}
          />
          <label className="mt-3 flex items-start gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={autoSplit}
              onChange={(e) => setAutoSplit(e.target.checked)}
            />
            <span>
              Auto-split reference marks into control points{" "}
              <span className="text-slate-400">
                (rows named WP/BRM/MTRM… or coded IPC/beacon become control points; the rest are survey points).
                Add <span className="font-mono">code</span> to the column order to classify by feature code too.
              </span>
            </span>
          </label>
        </>
      ) : (
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
      )}

      {/* Parse errors */}
      {parsed.errors.length > 0 && (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
          {parsed.errors.slice(0, 6).map((e, i) => (
            <div key={i}>{e}</div>
          ))}
          {parsed.errors.length > 6 && <div>…and {parsed.errors.length - 6} more</div>}
        </div>
      )}

      {/* Survey points preview */}
      {parsed.surveyPreview.length > 0 && (
        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">
              Survey points — {parsed.surveyPreview.length}
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
                {parsed.surveyPreview.map((p) => (
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

      {/* Control points preview (auto-split) */}
      {parsed.controlPreview.length > 0 && (
        <div className="mt-4">
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
            Control / reference points — {parsed.controlPreview.length}{" "}
            <span className="font-normal normal-case text-slate-400">(auto-split)</span>
          </h3>
          <div className="max-h-60 overflow-auto rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-50">
                <tr className="text-left text-xs uppercase text-slate-400">
                  <th className="px-3 py-2 font-semibold">Point</th>
                  <th className="px-3 py-2 font-semibold">Code</th>
                  <th className="px-3 py-2 text-right font-semibold">Easting</th>
                  <th className="px-3 py-2 text-right font-semibold">Northing</th>
                </tr>
              </thead>
              <tbody>
                {parsed.controlPreview.map((p) => (
                  <tr key={p.name} className="border-t border-slate-100">
                    <td className="px-3 py-1.5 font-medium text-slate-800">{p.name}</td>
                    <td className="px-3 py-1.5 text-slate-500">{p.code || "—"}</td>
                    <td className="num px-3 py-1.5 text-right text-slate-600">{fmt(p.easting)}</td>
                    <td className="num px-3 py-1.5 text-right text-slate-600">{fmt(p.northing)}</td>
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
          {result.survey && (
            <div>
              Survey: {result.survey.created} created, {result.survey.updated} updated
              {result.survey.skipped?.length ? `, ${result.survey.skipped.length} skipped (already exist)` : ""}.
            </div>
          )}
          {result.control && (
            <div>
              Control: {result.control.created} created, {result.control.updated} updated
              {result.control.skipped?.length ? `, ${result.control.skipped.length} skipped (already exist)` : ""}.
            </div>
          )}
        </div>
      )}

      <div className="mt-4 flex items-center gap-3">
        <button type="button" className="btn-primary" onClick={doImport} disabled={importing}>
          {importing ? "Importing…" : `Import ${totalCount || ""} point${totalCount === 1 ? "" : "s"}`}
        </button>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} />
          Overwrite existing points with the same name
        </label>
      </div>
    </div>
  );
}

function SingleBox({ refValue, onRef, text, onText }) {
  function onFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => onText(String(reader.result || ""));
    reader.readAsText(file);
    e.target.value = "";
  }
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-slate-500">Points data</span>
        <input
          className="input !w-40 !py-1 text-xs"
          placeholder="Reference station (e.g. WP1)"
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
        placeholder={"A, 60960.62, 2432202.016, 75MM CFP\nB, 60953.981, 2432249.05, 75MM CFP\nC, 60993.866, 2432250.235, 75MM CFP"}
        value={text}
        onChange={(e) => onText(e.target.value)}
      />
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
    e.target.value = "";
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
