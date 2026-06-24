"use client";

import { useEffect, useState, use } from "react";
import Spinner from "@/components/Spinner";
import BackButton from "@/components/BackButton";
import { api } from "@/lib/api";
import { fmt, positionQuality } from "@/lib/survey";

export default function ReportPage({ params }) {
  const { id } = use(params);
  const [job, setJob] = useState(null);
  const [control, setControl] = useState([]);
  const [points, setPoints] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [generatedAt, setGeneratedAt] = useState("");

  useEffect(() => {
    setGeneratedAt(new Date().toLocaleString());
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

  if (loading) return <Spinner label="Building report…" />;
  if (error)
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        {error}
      </div>
    );
  if (!job) return null;

  const exceeded = points.filter((p) => p.computed?.limitExceeded);
  const tx = job.transformation || {};
  const t3 = job.transformation3D || {};
  const hx = job.heightTransformation || {};
  const sortedControl = [...control].sort((a, b) => naturalCmp(a.name, b.name));
  const controlByName = Object.fromEntries(control.map((c) => [c.name, c]));
  const isIdentical = (c) => [c.wgs84X, c.wgs84Y, c.wgs84Z].some((v) => v != null);
  const residualPoints = sortedControl.filter((c) =>
    [c.resE, c.resN, c.resHgt].some((v) => v != null)
  );
  // Calibration "common points" = the reference marks (by type, or any control
  // point carrying WGS-84 / residual calibration data). Excludes the working point.
  const calibrationPoints = sortedControl.filter(
    (c) => c.pointType === "Reference Mark" || isIdentical(c) || [c.resE, c.resN, c.resHgt].some((v) => v != null)
  );
  // "Mean Coordinates and Differences" lists only the double-polar points
  // (2+ observations) — exactly as the Leica field book does.
  const meanPoints = points.filter((p) => (p.computed?.observationCount || 0) >= 2);

  // The reference marks were themselves surveyed from the working point during
  // calibration — they must appear as Baseline entries too, BEFORE the beacons,
  // but only once (the "first polar" round; they aren't re-surveyed on the
  // second polar). Synthesised from the control points' own stored coordinates,
  // since a reference mark only ever has a single fixed position (no
  // double-polar pairing of its own).
  const workingPoint = sortedControl.find((c) => c.pointType === "Working Point");
  const refMarkBaselines = calibrationPoints
    .filter((rm) => rm.easting != null && rm.northing != null)
    .map((rm) => ({
      p: { _id: `refmark-${rm._id}`, name: rm.name },
      o: {
        reference: workingPoint?.name || job.coordinateSystemName || "WP",
        dateTime: "",
        easting: rm.easting,
        northing: rm.northing,
        height: rm.height,
        sdE: null,
        sdN: null,
        sdHgt: null,
        sdSlope: null,
      },
      isReferenceMark: true,
    }));

  // GPS Coordinates baselines, grouped by reference station (as Leica does:
  // all rovers from base 1, then all rovers from base 2…), rovers by name.
  const baselines = [
    ...refMarkBaselines,
    ...points.flatMap((p) => (p.observations || []).map((o) => ({ p, o }))),
  ];
  const refOrder = [];
  for (const b of baselines) {
    if (!refOrder.includes(b.o.reference)) refOrder.push(b.o.reference);
  }
  baselines.sort((a, b) => {
    const d = refOrder.indexOf(a.o.reference) - refOrder.indexOf(b.o.reference);
    if (d !== 0) return d;
    // Within the same reference group, reference marks always come first
    // (surveyed before the beacons), regardless of name.
    if (!!a.isReferenceMark !== !!b.isReferenceMark) return a.isReferenceMark ? -1 : 1;
    return naturalCmp(a.p.name, b.p.name);
  });

  // The date under the title is the report generation time (as in the Leica book).
  const reportDate = generatedAt;

  return (
    <div>
      {/* Toolbar (hidden on print) */}
      <div className="no-print mb-4 flex items-center justify-between">
        <BackButton label="Back" />
        <button className="btn-primary" onClick={() => window.print()}>
          🖨 Print / Save as PDF
        </button>
      </div>

      <div className="print-container mx-auto max-w-4xl bg-white px-12 py-10 text-[12.5px] leading-[1.45] text-black">
        {/* Report header — centred title + date */}
        <div className="mb-6">
          <h1 className="text-center text-[22px] font-bold text-black">Fieldbook Report</h1>
          <p className="mt-0.5 text-center text-[12px] text-black">{reportDate}</p>
        </div>

        {/* Job information */}
        <Band>Job Information</Band>
        <Fields>
          <Row label="Job name" value={job.name} />
          <Row
            label="Created"
            value={fmtDateMaybe(job.jobCreated) || (job.createdAt ? new Date(job.createdAt).toLocaleString() : "")}
          />
          <Row label="Description" value={job.description} />
          <Row label="Creator" value={job.creator} />
          <Row label="Time zone" value={job.timezone} />
          <Row label="Coordinate system name" value={job.coordinateSystemName} />
          <Row label="Application software" value={job.applicationSoftware} />
          <Row label="Firmware version" value={job.firmwareVersion} />
          <Row label="Average limit (Position)" value={`${fmt(job.positionLimit, 4)} m`} mono />
          <Row label="Average limit (Height)" value={`${fmt(job.heightLimit, 4)} m`} mono />
        </Fields>

        {/* Coordinate system information */}
        <Band>Coordinate System Information</Band>
        <Fields>
          <Row label="Coordinate system name" value={job.coordinateSystemName} />
          <Row label="Created" value={job.coordinateSystemCreated} />
          <Row label="Transformation name" value={job.transformationName} />
          <Row label="Transformation type" value={job.transformationType} />
          <Row label="Height mode" value={job.heightMode} />
          <Row label="Pre-transformation name" value={job.preTransformationName} />
          <Row label="Residuals" value={job.residualsFormula} />
          <Row label="Local Ellipsoid" value={job.ellipsoid} />
          <Row label="Projection" value={job.projection} />
          <Row label="Geoid model" value={job.geoidModel} />
          <Row label="CSCS model" value={job.cscsModel} />
        </Fields>

        {/* Transformation details (plain heading, no band) */}
        <Plain>Transformation details</Plain>

        {/* 3D-Helmert transformation (Bursa-Wolf; all-zero when no height) */}
        <Band sub>3D-Helmert transformation</Band>
        <Fields>
          <Row label="Number of common points" value={String(t3.commonPoints ?? 0)} />
          <Row label="Transformation model" value={t3.model || "Bursa-Wolf"} />
        </Fields>
        <table className="mb-3 mt-2 border-collapse">
          <thead>
            <tr>
              <Th w="3rem">No.</Th>
              <Th w="9rem">Parameter</Th>
              <Th>Value</Th>
            </tr>
          </thead>
          <tbody>
            <TransformRow n={1} p="Shift dX" v={`${fmtVal(t3.shiftDX ?? 0)} m`} />
            <TransformRow n={2} p="Shift dY" v={`${fmtVal(t3.shiftDY ?? 0)} m`} />
            <TransformRow n={3} p="Shift dZ" v={`${fmtVal(t3.shiftDZ ?? 0)} m`} />
            <TransformRow n={4} p="Rotation about X" v={t3.rotX || "0.00000\""} />
            <TransformRow n={5} p="Rotation about Y" v={t3.rotY || "0.00000\""} />
            <TransformRow n={6} p="Rotation about Z" v={t3.rotZ || "0.00000\""} />
            <TransformRow n={7} p="Scale" v={`${fmtVal(t3.scalePpm ?? 0)} ppm`} />
          </tbody>
        </table>

        <Band sub>2D-Helmert transformation</Band>
        <Fields>
          {/* Common points = the reference marks used for calibration (from the CSV). */}
          <Row label="Number of common points" value={String(calibrationPoints.length || tx.commonPoints || 0)} />
          <div className="flex">
            <span className="w-52 shrink-0">Rotation origin:</span>
            <span className="num">X0: {fmt(tx.rotationOriginX)} m</span>
          </div>
          <div className="flex">
            <span className="w-52 shrink-0" />
            <span className="num">Y0: {fmt(tx.rotationOriginY)} m</span>
          </div>
        </Fields>
        {(tx.dE != null || tx.dN != null || tx.rotation || tx.scalePpm != null) && (
          <table className="mt-2 border-collapse">
            <thead>
              <tr>
                <Th w="3rem">No.</Th>
                <Th w="8rem">Parameter</Th>
                <Th>Value</Th>
              </tr>
            </thead>
            <tbody>
              <TransformRow n={1} p="dE" v={tx.dE != null ? `${fmtVal(tx.dE)} m` : "-"} />
              <TransformRow n={2} p="dN" v={tx.dN != null ? `${fmtVal(tx.dN)} m` : "-"} />
              <TransformRow n={3} p="Rotation" v={tx.rotation || "-"} />
              <TransformRow n={4} p="Scale" v={tx.scalePpm != null ? `${fmtVal(tx.scalePpm)} ppm` : "-"} />
            </tbody>
          </table>
        )}

        {/* Height transformation (sub-band) */}
        <Band sub>Height transformation</Band>
        <Fields>
          <Row label="Number of common points" value={String(calibrationPoints.length || hx.commonPoints || 0)} />
          <Row label="Mean transformation accuracy" value={hx.meanAccuracy != null ? `${fmt(hx.meanAccuracy, 4)} m` : "0.0000 m"} mono />
          <Row label="Parameters" value={hx.parameters || "-"} mono />
          <Row label="Inclination of height in X" value={hx.inclinationX || "-"} />
          <Row label="Inclination of height in Y" value={hx.inclinationY || "-"} />
        </Fields>

        {/* Residuals (plain heading) */}
        <Plain>Residuals</Plain>
        <Plain sub>Grid:</Plain>
        {residualPoints.length === 0 ? (
          <EmptyNote>No calibration residuals recorded.</EmptyNote>
        ) : (
          <table className="border-collapse">
            <thead>
              <tr>
                <Th>System A</Th>
                <Th>System B</Th>
                <Th>Point type</Th>
                <Th>dE [m]</Th>
                <Th>dN [m]</Th>
                <Th>dHgt [m]</Th>
              </tr>
            </thead>
            <tbody>
              {residualPoints.map((c, i) => (
                <tr key={c._id}>
                  <Td>{c.name}</Td>
                  <Td>{c.name}</Td>
                  <Td>{c.pointType || "Position"}</Td>
                  <Td mono>{c.resE != null ? `${fmt(c.resE, 4)} m` : "-"}</Td>
                  <Td mono>{c.resN != null ? `${fmt(c.resN, 4)} m` : "-"}</Td>
                  <Td mono>{c.resHgt != null ? `${fmt(c.resHgt, 4)} m` : "-"}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* List of identical points = the reference marks used for calibration.
            System A (WGS-84) only shows when those coords are on file; System B
            (Local Grid) always shows from the reference marks' grid coordinates. */}
        <Plain>List of identical points</Plain>
        {calibrationPoints.length === 0 ? (
          <EmptyNote>No reference marks. Mark points as “Reference Mark” when importing the CSV.</EmptyNote>
        ) : (
          <>
            {calibrationPoints.some(isIdentical) && (
              <>
                <Plain sub>System A:</Plain>
                <Plain sub>WGS 84 Cartesian:</Plain>
                <table className="mb-2 border-collapse">
                  <thead>
                    <tr>
                      <Th w="6rem">Point</Th>
                      <Th right>X [m]</Th>
                      <Th right>Y [m]</Th>
                      <Th right>Z [m]</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {calibrationPoints.map((c) => (
                      <tr key={c._id}>
                        <Td>{c.name}</Td>
                        <Td right mono>{fmt(c.wgs84X, 4)}</Td>
                        <Td right mono>{fmt(c.wgs84Y, 4)}</Td>
                        <Td right mono>{fmt(c.wgs84Z, 4)}</Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
            <Plain sub>System B:</Plain>
            <Plain sub>Local Grid:</Plain>
            <table className="border-collapse">
              <thead>
                <tr>
                  <Th w="6rem">Point</Th>
                  <Th right>Easting [m]</Th>
                  <Th right>Northing [m]</Th>
                  <Th right>Hgt [m]</Th>
                </tr>
              </thead>
              <tbody>
                {calibrationPoints.map((c) => (
                  <tr key={c._id}>
                    <Td>{c.name}</Td>
                    <Td right mono>{fmt(c.easting, 4)}</Td>
                    <Td right mono>{fmt(c.northing, 4)}</Td>
                    <Td right mono>{fmt(c.height, 4)}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {/* GPS Coordinates */}
        <Band>GPS Coordinates</Band>
        {baselines.length === 0 ? (
          <EmptyNote>No survey points recorded.</EmptyNote>
        ) : (
          <div className="space-y-4">
            {baselines.map(({ p, o }, i) => {
                const ref = controlByName[o.reference];
                const hasRef = !!ref && (ref.easting != null || ref.northing != null);
                const pq = positionQuality(o);
                const hasQuality = [o.sdE, o.sdN, o.sdHgt, o.sdSlope, pq].some((v) => v != null);
                return (
                  <div key={`${p._id}-${i}`}>
                    {/* Baseline band */}
                    <div className="grid grid-cols-3 gap-2 bg-[#d9d9d9] px-1.5 py-[3px] text-[12px] font-bold text-black">
                      <span className="whitespace-nowrap">Baseline</span>
                      <span className="whitespace-nowrap">Reference: {o.reference || "—"}</span>
                      <span className="whitespace-nowrap">Rover: {p.name}</span>
                    </div>
                    <div className="border-b border-slate-300 pt-1">
                      <div className="font-bold">Local Coordinates:</div>
                      <CoordLine
                        label="Easting"
                        a={hasRef ? `${fmt(ref.easting, 4)} m` : null}
                        b={`${fmt(o.easting, 4)} m`}
                      />
                      <CoordLine
                        label="Northing"
                        a={hasRef ? `${fmt(ref.northing, 4)} m` : null}
                        b={`${fmt(o.northing, 4)} m`}
                      />
                      <CoordLine
                        label="Ellip. Hgt"
                        a={hasRef ? fmt(ref.height, 4) : null}
                        b={fmt(o.height, 4)}
                      />
                    </div>
                    {hasQuality && (
                      <div className="grid grid-cols-[5rem_1fr] pt-1 text-[12px]">
                        <span className="font-bold">Quality:</span>
                        <div className="num flex flex-col gap-0.5">
                          <div className="flex flex-wrap gap-x-4 whitespace-nowrap">
                            <span>Sd. E: {fmt(o.sdE, 4)} m</span>
                            <span>Sd. N: {fmt(o.sdN, 4)} m</span>
                            <span>Sd. Hgt: {fmt(o.sdHgt, 4)} m</span>
                          </div>
                          <div className="flex flex-wrap gap-x-4 whitespace-nowrap">
                            <span>Posn. Qlty: {fmt(pq, 4)} m</span>
                            <span>Sd. Slope: {fmt(o.sdSlope, 4)} m</span>
                          </div>
                        </div>
                      </div>
                    )}
                    {!hasRef && o.reference && (
                      <p className="pt-1 text-[11px] italic text-slate-500">
                        Reference “{o.reference}” has no grid coordinates on file — rover only.
                      </p>
                    )}
                  </div>
                );
            })}
          </div>
        )}

        {/* Mean coordinates and differences */}
        <div className="mt-4">
          <Band>Mean Coordinates and Differences</Band>
        </div>
        {meanPoints.length === 0 ? (
          <EmptyNote>No double-polar points to report.</EmptyNote>
        ) : (
          <div className="space-y-4">
            {meanPoints.map((p) => {
              const c = p.computed || {};
              const perObs = c.perObservation || [];
              const isSingle = (c.observationCount || 0) < 2;
              return (
                <div key={p._id}>
                  <Band>Point {p.name}</Band>
                  <Plain>Avg. Local Coordinates</Plain>
                  <Fields>
                    <Row label="Easting" value={`${fmt(c.meanEasting, 4)} m`} mono />
                    <Row label="Northing" value={`${fmt(c.meanNorthing, 4)} m`} mono />
                    <Row label="Ortho. Hgt" value={fmt(c.meanHeight, 4)} mono />
                    <Row label="CQ" value={`${fmt(c.cq, 4)} m`} mono />
                  </Fields>
                  {isSingle ? (
                    <p className="pt-1 text-[12px] italic text-slate-500">
                      Single observation — no double-polar check available.
                    </p>
                  ) : (
                    <table className="mt-1 border-collapse">
                      <thead>
                        <tr>
                          <Th>Use</Th>
                          <Th>Limit exceeded</Th>
                          <Th>Reference</Th>
                          <Th>Date / Time</Th>
                          <Th right>Posn. diff [m]</Th>
                          <Th right>Hgt. diff [m]</Th>
                          <Th right>Posn. + Hgt. diff [m]</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {perObs.map((o, i) => (
                          <tr key={i}>
                            <Td>✓</Td>
                            <Td>
                              {c.limitExceeded ? (
                                <span className="font-bold text-red-600">Yes</span>
                              ) : (
                                ""
                              )}
                            </Td>
                            <Td nowrap>{o.reference || "-"}</Td>
                            <Td nowrap>{o.dateTime || "-"}</Td>
                            <Td right mono>{fmt(o.deviationPosn, 4)}</Td>
                            <Td right mono>{fmt(o.deviationHgt, 4)}</Td>
                            <Td right mono>{fmt(o.deviationCombined, 4)}</Td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Summary footer (not in the original — kept for the operator) */}
        <div className="no-print mt-8 border-t border-slate-300 pt-3 text-[12px]">
          <span className="font-bold">Summary:</span> {points.length} survey point
          {points.length === 1 ? "" : "s"}, {control.length} control point
          {control.length === 1 ? "" : "s"}.{" "}
          {exceeded.length === 0 ? (
            <span className="font-bold text-emerald-700">All points within tolerance.</span>
          ) : (
            <span className="font-bold text-red-600">
              {exceeded.length} point{exceeded.length === 1 ? "" : "s"} exceeded the limit:{" "}
              {exceeded.map((p) => p.name).join(", ")}.
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------- presentational helpers (match Leica Geo Office field book) ---------- */

function naturalCmp(a = "", b = "") {
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
}

// Full-width grey section band (sub = narrower band for sub-sections).
function Band({ children, sub }) {
  return (
    <h2
      className={`mb-1 mt-3 bg-[#d9d9d9] px-1.5 py-[3px] text-[12.5px] font-bold text-black ${
        sub ? "w-3/5" : "w-full"
      }`}
    >
      {children}
    </h2>
  );
}

// Plain bold heading (no band). sub = smaller secondary heading.
function Plain({ children, sub }) {
  return (
    <h3 className={`font-bold text-black ${sub ? "mt-1 text-[12px]" : "mb-1 mt-3 text-[12.5px]"}`}>
      {children}
    </h3>
  );
}

// Container for a single-column label : value list.
function Fields({ children }) {
  return <div className="mb-2 mt-1">{children}</div>;
}

// One "Label:  value" line (label left, value at a tab stop).
function Row({ label, value, mono }) {
  return (
    <div className="flex text-[12.5px]">
      <span className="w-52 shrink-0 text-black">{label}:</span>
      <span className={`text-black ${mono ? "num" : ""}`}>{value || "-"}</span>
    </div>
  );
}

// One GPS local-coordinate line: label, reference value, rover value.
function CoordLine({ label, a, b }) {
  return (
    <div className="grid grid-cols-3 text-[12px]">
      <span>{label}:</span>
      <span className="num">{a ?? ""}</span>
      <span className="num">{b}</span>
    </div>
  );
}

function EmptyNote({ children }) {
  return <p className="py-1 text-[12px] italic text-slate-500">{children}</p>;
}

// Borderless table header cell (bold), matching the field book's plain tables.
function Th({ children, right, w }) {
  return (
    <th
      className={`pr-6 py-[2px] align-bottom text-[12px] font-bold text-black ${right ? "text-right" : "text-left"}`}
      style={w ? { width: w } : undefined}
    >
      {children}
    </th>
  );
}
function Td({ children, right, mono, nowrap }) {
  return (
    <td className={`pr-6 py-[1px] text-[12px] text-black ${right ? "text-right" : "text-left"} ${mono ? "num" : ""} ${nowrap ? "whitespace-nowrap" : ""}`}>
      {children}
    </td>
  );
}
function TransformRow({ n, p, v }) {
  return (
    <tr>
      <Td>{n}</Td>
      <Td>{p}</Td>
      <Td mono>{v}</Td>
    </tr>
  );
}

// Format value with explicit decimal places, showing negative sign always.
function fmtVal(v, dp = 4) {
  if (v === null || v === undefined || v === "" || !Number.isFinite(Number(v))) return "-";
  return Number(v).toFixed(dp);
}

// If a value is an ISO timestamp, show it as a clean local date-time; else as-is.
function fmtDateMaybe(v) {
  if (!v) return "";
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) {
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) return d.toLocaleString();
  }
  return s;
}
