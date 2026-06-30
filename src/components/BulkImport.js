"use client";

import { useMemo, useState } from "react";
import { api } from "@/lib/api";
import { parsePastedRows, pairPolars } from "@/lib/csv";
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
  // Per-point type override: { [name]: "Beacon" | "Reference Mark" | "Working Point" }.
  // Default is Beacon (a survey point); the surveyor marks reference marks / the
  // working point in the preview. Reference Mark + Working Point → control points.
  const [typeByName, setTypeByName] = useState({});
  // Generate the double-polar field book: measure each beacon from the working
  // point AND a reference mark (two independent observations) so the GPS
  // Coordinates + Mean Coordinates sections populate, as the surveyor does on site.
  const [doublePolar, setDoublePolar] = useState(true);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  const columns = useMemo(
    () => columnSpec.split(",").map((c) => c.trim()).filter(Boolean),
    [columnSpec]
  );

  const parsed = useMemo(() => {
    // Build one unified point object (with its current Type) from grouped rows.
    const toPoint = (name, groupRows) => {
      const first = groupRows[0];
      // Every point defaults to Beacon (a survey point); the surveyor marks the
      // reference marks and the working point explicitly in the preview.
      const type = typeByName[name] ?? "Beacon";
      const isControl = type === "Reference Mark" || type === "Working Point";
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
      return {
        name,
        type,
        isControl,
        code: first.code || "",
        easting: first.easting,
        northing: first.northing,
        height: first.height ?? null,
        wgs84X: first.wgs84X ?? null,
        wgs84Y: first.wgs84Y ?? null,
        wgs84Z: first.wgs84Z ?? null,
        resE: first.resE ?? null,
        resN: first.resN ?? null,
        resHgt: first.resHgt ?? null,
        observations,
        computed: computeSurveyPoint(observations, limits || {}),
      };
    };

    if (mode === "single") {
      const { rows, errors } = parsePastedRows(singleText, columns);
      // Group by point name: a repeated name = the SAME point measured more than
      // once = double polar. Order preserved (Map keeps insertion order).
      // EXCEPTION: an exact duplicate row (same name, same Easting/Northing) is
      // an accidental copy-paste in the source CSV, not a real second
      // observation — keep only the first occurrence, and flag it so the
      // surveyor knows the CSV has a repeated line (client's CSV had point
      // "20" listed twice, which produced a broken "Polar 1/Polar 2" entry
      // with no date/time instead of the normal synthesized double-polar pair).
      const groups = new Map();
      for (const row of rows) {
        if (!groups.has(row.name)) groups.set(row.name, []);
        const groupRows = groups.get(row.name);
        const isExactDuplicate = groupRows.some(
          (r) => r.easting === row.easting && r.northing === row.northing
        );
        if (isExactDuplicate) {
          errors.push(
            `Point "${row.name}": duplicate row in the CSV (same Easting/Northing) — the repeated line was ignored.`
          );
          continue;
        }
        groupRows.push(row);
      }
      const points = [];
      for (const [name, groupRows] of groups) points.push(toPoint(name, groupRows));
      return { points, errors };
    } else {
      const first = parsePastedRows(firstText, columns);
      const second = parsePastedRows(secondText, columns);
      const paired = pairPolars(first.rows, second.rows, firstRef || "Polar 1", secondRef || "Polar 2");
      // In double-polar (2 files) mode, ALL paired points are survey beacons —
      // the two CSVs are two independent polar observations of the same beacons.
      // Never treat them as control/reference marks.
      const points = paired.map((p) => ({
        name: p.name,
        type: "Beacon",
        isControl: false,
        code: p.code || "",
        easting: p.observations[0]?.easting ?? null,
        northing: p.observations[0]?.northing ?? null,
        height: p.observations[0]?.height ?? null,
        wgs84X: null, wgs84Y: null, wgs84Z: null, resE: null, resN: null, resHgt: null,
        observations: p.observations,
        computed: computeSurveyPoint(p.observations, limits || {}),
      }));
      return { points, errors: [...first.errors, ...second.errors] };
    }
  }, [mode, singleText, singleRef, firstText, secondText, columns, firstRef, secondRef, limits, typeByName]);

  const surveyPreview = parsed.points.filter((p) => !p.isControl);
  const controlPreview = parsed.points.filter((p) => p.isControl);
  const exceededCount = surveyPreview.filter((p) => p.computed.limitExceeded).length;
  const totalCount = parsed.points.length;
  // Closest pair of survey points — warn if two beacons are suspiciously close
  // (client: points "should not be too close to each other").
  const closest = (() => {
    const pts = surveyPreview
      .map((p) => ({ name: p.name, e: p.computed.meanEasting, n: p.computed.meanNorthing }))
      .filter((p) => p.e != null && p.n != null);
    let min = Infinity;
    let pair = null;
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const d = Math.hypot(pts[i].e - pts[j].e, pts[i].n - pts[j].n);
        if (d < min) {
          min = d;
          pair = [pts[i].name, pts[j].name];
        }
      }
    }
    return pair ? { min, pair } : null;
  })();
  function setType(name, type) {
    setTypeByName((prev) => ({ ...prev, [name]: type }));
  }

  // Double-polar bases: first the working point, then a reference mark (as on
  // site — measure all beacons from the working point, then move to a reference
  // mark and re-measure). Used to synthesise the 2nd observation per beacon.
  const workingPoint = controlPreview.find((p) => p.type === "Working Point");
  const refMarks = controlPreview.filter((p) => p.type === "Reference Mark");
  const firstBase = workingPoint || refMarks[0] || controlPreview[0];
  const secondBase =
    refMarks.find((r) => r.name !== firstBase?.name) ||
    controlPreview.find((c) => c.name !== firstBase?.name);
  const canDouble =
    doublePolar && !!firstBase && !!secondBase && firstBase.name !== secondBase.name;

  // Expand each single-observation beacon into a double-polar pair.
  // The mean of the two observations equals the original CSV coordinate exactly.
  // Reference names come from the Working Point / Reference Mark if set, else "Polar 1" / "Polar 2".
  function buildSurveyPayload() {
    // Auto-generated observation timestamps must always fall within working
    // hours (06:00–18:00) — never wrap into the evening/night. Anchor to
    // today's date at 00:00, then place every offset inside a 12-hour window
    // starting at 06:00; once a "day" of working hours is filled, continue
    // into 06:00 the next day rather than spilling past 18:00.
    const WORK_START_MIN = 6 * 60; // 06:00
    const WORK_SPAN_MIN = 12 * 60; // 06:00–18:00
    const anchor = new Date();
    anchor.setHours(0, 0, 0, 0);
    const n = surveyPreview.length;
    const p2 = (x) => String(x).padStart(2, "0");
    const at = (mins) => {
      const dayOffset = Math.floor(mins / WORK_SPAN_MIN);
      const minuteOfDay = WORK_START_MIN + (mins % WORK_SPAN_MIN);
      const d = new Date(anchor.getTime() + dayOffset * 86400000 + minuteOfDay * 60000);
      return `${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${d.getFullYear()} ${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`;
    };
    const r4 = (v) => Math.round(v * 10000) / 10000;
    const sd = () => r4(0.004 + Math.random() * 0.012);
    const ref1 = canDouble ? firstBase.name : (firstRef || "Polar 1");
    const ref2 = canDouble ? secondBase.name : (secondRef || "Polar 2");
    return surveyPreview.map((p, i) => {
      if (p.observations.length === 1) {
        const o = p.observations[0];
        const dE = r4((Math.random() - 0.5) * 0.012);
        const dN = r4((Math.random() - 0.5) * 0.012);
        const mk = (refName, mins, sgn) => ({
          reference: refName,
          dateTime: at(mins),
          easting: r4(o.easting + sgn * dE),
          northing: r4(o.northing + sgn * dN),
          height: o.height ?? null,
          sdE: sd(),
          sdN: sd(),
          sdHgt: r4(0.01 + Math.random() * 0.02),
          sdSlope: sd(),
        });
        return {
          name: p.name,
          code: p.code,
          observations: [
            mk(ref1, i * 4, +1),
            mk(ref2, n * 4 + 15 + i * 4, -1),
          ],
        };
      }
      return { name: p.name, code: p.code, observations: p.observations };
    });
  }

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

      if (surveyPreview.length) {
        survey = await api.post(`/api/jobs/${jobId}/survey/import`, {
          overwrite,
          points: buildSurveyPayload(),
        });
      }
      if (controlPreview.length) {
        controlRes = await api.post(`/api/jobs/${jobId}/control/import`, {
          overwrite,
          points: controlPreview.map((p) => ({
            name: p.name,
            code: p.code,
            pointType: p.type, // "Reference Mark" | "Working Point"
            easting: p.easting,
            northing: p.northing,
            height: p.height,
            wgs84X: p.wgs84X,
            wgs84Y: p.wgs84Y,
            wgs84Z: p.wgs84Z,
            resE: p.resE,
            resN: p.resN,
            resHgt: p.resHgt,
          })),
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
              ? "Upload one CSV / paste below. Every point defaults to Beacon (a survey point) — set the Type for each reference mark and the working point in the preview below."
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
          <span>Tokens: name, code, easting, northing, height, sdE, sdN, sdHgt, reference, wgs84X, wgs84Y, wgs84Z, resE, resN, resHgt, ignore.</span>
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
        <SingleBox
          refValue={singleRef}
          onRef={setSingleRef}
          text={singleText}
          onText={setSingleText}
        />
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

      {/* Spacing warning — survey points too close together */}
      {closest && closest.min < 1 && (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
          Points <span className="font-semibold">{closest.pair[0]}</span> and{" "}
          <span className="font-semibold">{closest.pair[1]}</span> are only {closest.min.toFixed(3)} m apart — check
          spacing (survey points shouldn’t be too close to each other).
        </div>
      )}

      {/* Unified preview — set the Type for each point (Beacon / Reference Mark / Working Point) */}
      {parsed.points.length > 0 && (
        <div className="mt-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">
              Points — {parsed.points.length}{" "}
              <span className="font-normal normal-case text-slate-400">
                {mode === "polar"
                  ? `(${parsed.points.length} survey beacon${parsed.points.length === 1 ? "" : "s"} with 2 polar observations each)`
                  : `(${surveyPreview.length} beacon${surveyPreview.length === 1 ? "" : "s"} → survey, ${controlPreview.length} reference mark / working point → control)`}
              </span>
            </h3>
            {exceededCount > 0 && (
              <span className="badge bg-red-100 text-red-700">
                {exceededCount} exceed the limit — check for typos
              </span>
            )}
          </div>
          <div className="max-h-80 overflow-auto rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-50">
                <tr className="text-left text-xs uppercase text-slate-400">
                  <th className="px-3 py-2 font-semibold">Point</th>
                  {mode === "single" && <th className="px-3 py-2 font-semibold">Type</th>}
                  <th className="px-3 py-2 text-center font-semibold">Obs</th>
                  <th className="px-3 py-2 text-right font-semibold">Mean Easting</th>
                  <th className="px-3 py-2 text-right font-semibold">Mean Northing</th>
                  <th className="px-3 py-2 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {parsed.points.map((p) => (
                  <tr key={p.name} className="border-t border-slate-100">
                    <td className="px-3 py-1.5 font-medium text-slate-800">{p.name}</td>
                    {mode === "single" && (
                      <td className="px-3 py-1.5">
                        <select
                          className="rounded border border-slate-300 bg-white px-1.5 py-1 text-xs"
                          value={p.type}
                          onChange={(e) => setType(p.name, e.target.value)}
                        >
                          <option value="Beacon">Beacon (survey)</option>
                          <option value="Reference Mark">Reference Mark</option>
                          <option value="Working Point">Working Point</option>
                        </select>
                      </td>
                    )}
                    <td className="px-3 py-1.5 text-center text-slate-600">
                      {mode === "single" && doublePolar && p.computed.observationCount === 1 && !p.isControl
                        ? <span title="Two polar observations will be auto-generated on import">2 <span className="text-slate-400">(auto)</span></span>
                        : p.computed.observationCount}
                    </td>
                    <td className="num px-3 py-1.5 text-right text-slate-600">
                      {fmt(p.isControl ? p.easting : p.computed.meanEasting)}
                    </td>
                    <td className="num px-3 py-1.5 text-right text-slate-600">
                      {fmt(p.isControl ? p.northing : p.computed.meanNorthing)}
                    </td>
                    <td className="px-3 py-1.5">
                      {p.isControl ? (
                        <span className="badge bg-slate-100 text-slate-600">{p.type}</span>
                      ) : (
                        <StatusBadge computed={p.computed} />
                      )}
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

      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
        <button type="button" className="btn-primary" onClick={doImport} disabled={importing}>
          {importing ? "Importing…" : `Import ${totalCount || ""} point${totalCount === 1 ? "" : "s"}`}
        </button>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} />
          Overwrite existing points with the same name
        </label>
        {mode === "single" && (
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={doublePolar} onChange={(e) => setDoublePolar(e.target.checked)} />
            Generate double-polar (measure each beacon from working point + reference mark)
          </label>
        )}
      </div>
      {mode === "single" && doublePolar && (
        <p className="mt-2 text-[11px] text-slate-400">
          {canDouble
            ? `Each beacon will get two polar observations — from ${firstBase.name} and ${secondBase.name} — with their mean equal to the CSV coordinate.`
            : `Each beacon will automatically get two polar observations (Polar 1 + Polar 2) with their mean equal to the CSV coordinate. Mark a Working Point and Reference Mark above to use custom reference names.`}
        </p>
      )}
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
