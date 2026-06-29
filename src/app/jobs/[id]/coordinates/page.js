"use client";

import { useEffect, useState, use } from "react";
import Spinner from "@/components/Spinner";
import BackButton from "@/components/BackButton";
import { api } from "@/lib/api";

/**
 * Coordinate List output — one of the field book's outputs (client request).
 * Lists every point in the job grouped like the surveyor's coordinate list
 * sample: Reference Marks, Working Points, then Beacons, each row = Name,
 * Easting, Northing, Description. Printable (Save as PDF) and downloadable as a
 * real Excel (.xlsx) file matching the client's "Coordinate list 610.xlsx" sample.
 */
export default function CoordinateListPage({ params }) {
  const { id } = use(params);
  const [job, setJob] = useState(null);
  const [control, setControl] = useState([]);
  const [points, setPoints] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [printing, setPrinting] = useState(false);

  // Let React paint the "Preparing…" state before the blocking window.print().
  function handlePrint() {
    setPrinting(true);
    setTimeout(() => {
      window.print();
      setPrinting(false);
    }, 150);
  }

  useEffect(() => {
    (async () => {
      try {
        const [j, c, s] = await Promise.all([
          api.get(`/api/jobs/${id}`),
          api.get(`/api/jobs/${id}/control`),
          api.get(`/api/jobs/${id}/survey`),
        ]);
        setJob(j);
        setControl(c);
        setPoints(s);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  if (loading) return <Spinner label="Building coordinate list…" />;
  if (error)
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        {error}
      </div>
    );
  if (!job) return null;

  // Description is standardised by point type (client rule):
  //   • Reference marks      → "12 mm iron peg in concrete"
  //   • Beacons & working pts → "12 mm iron peg"
  const PEG = "12 mm iron peg";
  const PEG_CONCRETE = "12 mm iron peg in concrete";

  // One coordinate row from a control point (own grid coords) or a survey point
  // (final averaged mean coordinate), with the type-based default description.
  const toRow = (p, description) => ({
    name: p.name,
    easting: p.computed?.meanEasting ?? p.easting ?? p.observations?.[0]?.easting ?? null,
    northing: p.computed?.meanNorthing ?? p.northing ?? p.observations?.[0]?.northing ?? null,
    description,
  });
  const byName = (a, b) => naturalCmp(a.name, b.name);
  const refMarks = control.filter((c) => c.pointType === "Reference Mark").sort(byName);
  const workingPts = control.filter((c) => c.pointType === "Working Point").sort(byName);
  const otherCtrl = control
    .filter((c) => c.pointType !== "Reference Mark" && c.pointType !== "Working Point")
    .sort(byName);
  const beacons = [...points].sort(byName);

  // Match the client's sample sequence exactly: only TWO headers —
  // "REFERENCE MARKS" (reference marks, then a blank line, then the working
  // points, then any other control) and "BEACONS". A `SPACER` marks the blank
  // separator row the sample shows between the reference marks and the WPs.
  const SPACER = { spacer: true };
  const refSection = [];
  for (const c of refMarks) refSection.push(toRow(c, PEG_CONCRETE));
  if (refSection.length && workingPts.length) refSection.push(SPACER);
  for (const c of workingPts) refSection.push(toRow(c, PEG));
  if (refSection.length && otherCtrl.length) refSection.push(SPACER);
  for (const c of otherCtrl) refSection.push(toRow(c, PEG));

  const groups = [
    ["REFERENCE MARKS", refSection],
    ["BEACONS", beacons.map((c) => toRow(c, PEG))],
  ].filter(([, rows]) => rows.length > 0);

  const title = `COORDINATE LIST ${job.name || ""}`.trim();

  // Build & download a real Excel (.xlsx) file matching the client's sample:
  // a title row, then each section (REFERENCE MARKS — incl. working points — then
  // BEACONS) with a "Description" header, the data rows, and blank spacer rows.
  async function downloadExcel() {
    const XLSX = await import("xlsx");
    const round2 = (v) => (v == null || !Number.isFinite(Number(v)) ? "" : Math.round(Number(v) * 100) / 100);
    const aoa = [[title], []];
    for (const [label, rows] of groups) {
      aoa.push([label, "", "", "Description"]);
      for (const r of rows) {
        if (r.spacer) aoa.push([]); // blank separator row (e.g. between ref marks and WPs)
        else aoa.push([r.name, round2(r.easting), round2(r.northing), r.description]);
      }
      aoa.push([]);
    }
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = [{ wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 28 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Coordinate List");
    XLSX.writeFile(wb, `${(job.name || "coordinate-list").replace(/[^\w.-]+/g, "_")}_coordinates.xlsx`);
  }

  return (
    <div>
      {/* Toolbar (hidden on print) */}
      <div className="no-print mb-4 flex items-center justify-between">
        <BackButton label="Back" />
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={downloadExcel}>
            ⬇ Download Excel
          </button>
          <button className="btn-primary" onClick={handlePrint} disabled={printing}>
            {printing ? "Preparing…" : "🖨 Print / Save as PDF"}
          </button>
        </div>
      </div>

      <div className="print-container mx-auto max-w-3xl bg-white px-12 py-10 text-[13px] leading-[1.5] text-black">
        <h1 className="mb-6 text-center text-[20px] font-bold text-black">{title}</h1>

        {groups.length === 0 ? (
          <p className="text-center text-slate-500">No points to list yet.</p>
        ) : (
          groups.map(([label, rows]) => (
            <div key={label} className="mb-6">
              <div className="mb-1 font-bold underline">{label}</div>
              <table className="w-full border-collapse">
                <thead>
                  <tr className="text-left">
                    <th className="w-[18%] py-1 pr-3 font-semibold">Name</th>
                    <th className="w-[22%] py-1 pr-3 text-right font-semibold">Easting [m]</th>
                    <th className="w-[22%] py-1 pr-3 text-right font-semibold">Northing [m]</th>
                    <th className="py-1 font-semibold">Description</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) =>
                    r.spacer ? (
                      <tr key={i}>
                        <td className="py-2" colSpan={4} />
                      </tr>
                    ) : (
                      <tr key={i}>
                        <td className="whitespace-nowrap py-0.5 pr-3">{r.name}</td>
                        <td className="num py-0.5 pr-3 text-right">{fmtNum(r.easting)}</td>
                        <td className="num py-0.5 pr-3 text-right">{fmtNum(r.northing)}</td>
                        <td className="py-0.5">{r.description || "-"}</td>
                      </tr>
                    )
                  )}
                </tbody>
              </table>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// Coordinate values to 2 decimal places (matches the surveyor's coordinate list).
function fmtNum(v) {
  return v == null || !Number.isFinite(Number(v)) ? "-" : Number(v).toFixed(2);
}

// Natural sort so M2 < M10 and B76 < B116.
function naturalCmp(a, b) {
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
}
