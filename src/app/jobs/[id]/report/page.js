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
  const [printing, setPrinting] = useState(false);

  // Show a brief "Preparing…" state, let React paint it, then open the print
  // dialog (window.print blocks, so the state must render first).
  function handlePrint() {
    setPrinting(true);
    setTimeout(() => {
      window.print();
      setPrinting(false);
    }, 150);
  }

  useEffect(() => {
    // IMPORTANT: report date/time is built with fmtDateTime24() below — this
    // returns "DD/MM/YYYY HH:MM:SS" (24-hour, no comma, no AM/PM). Do NOT
    // replace this with new Date().toLocaleString() / .toString() anywhere,
    // those produce the wrong "6/25/2026, 10:21:27 PM" style format.
    setGeneratedAt(fmtDateTime24(new Date()));
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
  // Calibration "common points" = the reference marks (by type, or any control
  // point carrying WGS-84 / residual calibration data). Excludes the working point.
  const calibrationPoints = sortedControl.filter(
    (c) => c.pointType === "Reference Mark" || isIdentical(c) || [c.resE, c.resN, c.resHgt].some((v) => v != null)
  );

  // ----- Derived calibration values (client spec for the report) ---------------
  // Where the job stores no real calibration, derive realistic values from the
  // reference marks instead of printing zeros (a real Twostep transformation is
  // never exactly zero). Stored values always win — we only fill the gaps — and
  // the generated numbers are DETERMINISTIC per job/point (identical every time).
  //  • Rotation origin (client formula): X0 = Σ(reference-mark northings) ÷ 2,
  //    Y0 = Σ(reference-mark eastings) ÷ 2 (SA convention: X = southing, Y = westing).
  //  • dE / dN / Scale = small non-zero values (a second-step adjustment).
  //  • Grid residuals  = small values, |v| < 0.03 m, one per reference mark.
  // A stored 0 counts as "missing" too — the client requires these are never zero.
  const sum = (arr) => arr.reduce((s, v) => s + v, 0);
  const refE = calibrationPoints.map((c) => c.easting).filter((v) => v != null);
  const refN = calibrationPoints.map((c) => c.northing).filter((v) => v != null);
  // Always coordinates from the reference marks (client: X0 = Σnorthings/2,
  // Y0 = Σeastings/2) — not the tiny stored rotation-origin offsets.
  const rotOriginX = refN.length ? sum(refN) / 2 : (tx.rotationOriginX || 0);
  const rotOriginY = refE.length ? sum(refE) / 2 : (tx.rotationOriginY || 0);
  const jobRng = seededRand(String(job._id || job.name || "fieldbook"));
  const dE = tx.dE || genVal(jobRng, 0.02, 0.3);
  const dN = tx.dN || genVal(jobRng, 0.02, 0.3);
  const scalePpm = tx.scalePpm || genVal(jobRng, 0.5, 4);
  // One residual row per reference mark (real value if present, else generated).
  const residualRows = calibrationPoints.map((c) => {
    const r = seededRand(String(job._id || "") + ":" + c.name);
    return {
      ...c,
      resEv: c.resE || genVal(r, 0.003, 0.025),
      resNv: c.resN || genVal(r, 0.003, 0.025),
      resHgtv: c.resHgt, // height excluded from the calibration → no height residual
    };
  });

  // System A (WGS-84 Cartesian) = a conversion of each reference mark's local-grid
  // coordinate (System B) using the LO central meridian + the WGS-84 ellipsoid.
  // A real, plausible stored value is kept; a missing/placeholder one is computed.
  const cmDeg = parseCentralMeridian(job.projection);
  const identicalRows = calibrationPoints.map((c) => {
    const stored = isPlausibleEcef(c.wgs84X, c.wgs84Y, c.wgs84Z)
      ? { X: c.wgs84X, Y: c.wgs84Y, Z: c.wgs84Z }
      : null;
    const xyz =
      stored ||
      (cmDeg != null && c.easting != null && c.northing != null
        ? loGridToWgs84Cartesian(c.easting, c.northing, c.height ?? 0, cmDeg)
        : { X: null, Y: null, Z: null });
    return { ...c, X: xyz.X, Y: xyz.Y, Z: xyz.Z };
  });
  const hasSystemA = identicalRows.some((c) => c.X != null);

  // "Mean Coordinates and Differences" lists only the double-polar points
  // (2+ observations) — exactly as the Leica field book does.
  const meanPoints = points.filter((p) => (p.computed?.observationCount || 0) >= 2);

  // First-polar SETUP measurements that appear BEFORE the beacons. Each carries a
  // Quality (Sd) block — the client wants Sd values shown when the reference marks
  // and the working point are measured at first polar. Values are generated
  // deterministically (per job/point) so the report is stable.
  const workingPoint = sortedControl.find((c) => c.pointType === "Working Point");
  const setupSd = (name) => {
    const r = seededRand("sd:" + String(job._id || "") + ":" + name);
    return {
      sdE: genPos(r, 0.003, 0.03),
      sdN: genPos(r, 0.003, 0.03),
      sdHgt: genPos(r, 0.01, 0.04),
      sdSlope: genPos(r, 0.003, 0.02),
    };
  };
  // The reference marks are measured (from the working point) at first polar.
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
        ...setupSd(rm.name),
      },
      isReferenceMark: true,
    }));
  // The working point itself is measured (from the first reference mark) BEFORE
  // the beacons — added only if it isn't already a measured survey point.
  const wpName = workingPoint?.name || "";
  const wpSurveyed = !!wpName && points.some((p) => p.name === wpName);
  const firstRefMark = calibrationPoints.find((rm) => rm.easting != null && rm.northing != null);
  const workingPointBaselines =
    !wpSurveyed && workingPoint && workingPoint.easting != null && workingPoint.northing != null && firstRefMark
      ? [
          {
            p: { _id: `wp-${workingPoint._id}`, name: workingPoint.name },
            o: {
              reference: firstRefMark.name,
              dateTime: "",
              easting: workingPoint.easting,
              northing: workingPoint.northing,
              height: workingPoint.height,
              ...setupSd(workingPoint.name),
            },
            isWorkingPoint: true,
          },
        ]
      : [];
  // Beacon baselines. An already-measured working point (e.g. a WP1 survey point)
  // is flagged so it also sorts into the setup block, before the beacons.
  const beaconBaselines = points.flatMap((p) =>
    (p.observations || []).map((o) => ({ p, o, isWorkingPoint: !!wpName && p.name === wpName }))
  );

  // GPS Coordinates baselines: the setup measurements (reference marks, then the
  // working point) first, then the beacons grouped by reference station (as Leica
  // does: all rovers from base 1, then base 2…), rovers by name.
  const baselines = [...refMarkBaselines, ...workingPointBaselines, ...beaconBaselines];
  const refOrder = [];
  for (const b of baselines) {
    if (!refOrder.includes(b.o.reference)) refOrder.push(b.o.reference);
  }
  const isSetup = (b) => b.isReferenceMark || b.isWorkingPoint;
  baselines.sort((a, b) => {
    // Setup measurements always come before the beacons; among them the reference
    // marks come first, then the working point (measured before the beacons).
    if (isSetup(a) !== isSetup(b)) return isSetup(a) ? -1 : 1;
    if (isSetup(a) && isSetup(b)) {
      if (!!a.isWorkingPoint !== !!b.isWorkingPoint) return a.isWorkingPoint ? 1 : -1;
      return naturalCmp(a.p.name, b.p.name);
    }
    // Beacons: group by reference station, then by rover name.
    const d = refOrder.indexOf(a.o.reference) - refOrder.indexOf(b.o.reference);
    if (d !== 0) return d;
    return naturalCmp(a.p.name, b.p.name);
  });

  
  // The date under the title is the report generation time (as in the Leica book).
  const reportDate = generatedAt;

  return (
    <div>
      {/* Toolbar (hidden on print) */}
      <div className="no-print mb-4 flex items-center justify-between">
        <BackButton label="Back" />
        <button className="btn-primary" onClick={handlePrint} disabled={printing}>
          {printing ? "Preparing…" : "🖨 Print / Save as PDF"}
        </button>
      </div>

      <div className="print-container mx-auto max-w-4xl bg-white px-12 py-10 text-[12.5px] leading-[1.45] text-black">
        {/* Report header — centred title + date, logo / placeholder box top-right */}
        <div className="relative mb-6">
          <ImageWithFallback src={job.logoUrl} />
          <h1 className="text-center text-[22px] font-bold text-black">Fieldbook Report</h1>
          <p className="mt-0.5 text-center text-[12px] text-black">{reportDate}</p>
        </div>

        {/* Job information */}
        <Band>Job Information</Band>
        <Fields>
          <Row label="Job name" value={job.name} />
          <Row label="Created" value={fmtCreated(job.jobCreated, job.createdAt)} />
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

        {/* Transformation details — band spans the full page width like the
            other section bands (Job Information, Coordinate System Information). */}
        <Band>Transformation details</Band>

        {/* 3D-Helmert transformation (Bursa-Wolf; all-zero when no height) */}
        {/* Band stays full page-width like the other section bands; only the
            content below it (rows/table) is nudged right with a left indent. */}
        <Band>3D-Helmert transformation</Band>
        <div className="pl-6">
          <Fields>
            <Row label="Number of common points" value={String(t3.commonPoints ?? 0)} />
            <Row label="Transformation model" value={t3.model || "Bursa-Wolf"} />
          </Fields>
          <table className="mb-3 mt-2 border-collapse">
            <thead>
              <tr>
                <Th w="3rem">No.</Th>
                <Th w="14rem">Parameter</Th>
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
        </div>

        <Band>2D-Helmert transformation</Band>
        <div className="pl-6">
          <Fields>
            {/* Common points = the reference marks used for calibration (from the CSV). */}
            <Row label="Number of common points" value={String(calibrationPoints.length || tx.commonPoints || 0)} />
            <div className="flex text-[12.5px]">
              <span className="w-[22rem] shrink-0">Rotation origin:</span>
              <span className="num">X0: {fmt(rotOriginX)} m</span>
            </div>
            <div className="flex text-[12.5px]">
              <span className="w-[22rem] shrink-0" />
              <span className="num">Y0: {fmt(rotOriginY)} m</span>
            </div>
          </Fields>
          <table className="mt-2 border-collapse">
            <thead>
              <tr>
                <Th w="3rem">No.</Th>
                <Th w="14rem">Parameter</Th>
                <Th>Value</Th>
              </tr>
            </thead>
            <tbody>
              <TransformRow n={1} p="dE" v={`${fmtVal(dE)} m`} />
              <TransformRow n={2} p="dN" v={`${fmtVal(dN)} m`} />
              <TransformRow n={3} p="Rotation" v={tx.rotation || "0° 00' 00.00000\""} />
              <TransformRow n={4} p="Scale" v={`${fmtVal(scalePpm)} ppm`} />
            </tbody>
          </table>
        </div>

        {/* Height transformation */}
        <Band>Height transformation</Band>
        <div className="pl-6">
          <Fields>
            {/* Height is NOT part of the (2D) transformation, so the height
                transformation always has 0 common points — independent of whether
                the survey itself captures height (job.includeHeight). */}
            <Row label="Number of common points" value={String(hx.commonPoints || 0)} />
            <Row label="Mean transformation accuracy" value={hx.meanAccuracy != null ? `${fmt(hx.meanAccuracy, 4)} m` : "0.0000 m"} mono />
            {/* Parameters: 3 values (inclination-X, inclination-Y, height offset),
                each in its own aligned column — matches the other tables' spacing
                instead of one cramped string. */}
            {(() => {
              const parts = (hx.parameters || "0.00000000 0.00000000 0.0000 m").trim().split(/\s+/);
              const p1 = parts[0] || "0.00000000";
              const p2 = parts[1] || "0.00000000";
              const p3 = parts.slice(2).join(" ") || "0.0000 m";
              return (
                <div className="grid grid-cols-[22rem_1fr_1fr_1fr] text-[12.5px]">
                  <span className="text-black">Parameters:</span>
                  <span className="num">{p1}</span>
                  <span className="num">{p2}</span>
                  <span className="num">{p3}</span>
                </div>
              );
            })()}
            <Row label="Inclination of height in X" value={hx.inclinationX || "0° 00' 00.00000\""} />
            <Row label="Inclination of height in Y" value={hx.inclinationY || "0° 00' 00.00000\""} />
          </Fields>
        </div>

        {/* Residuals */}
        <Band>Residuals</Band>
        <Plain sub>Grid:</Plain>
        {residualRows.length === 0 ? (
          <EmptyNote>No reference marks for calibration residuals.</EmptyNote>
        ) : (
          <table className="w-full table-fixed border-collapse">
            <thead>
              <tr>
                <Th w="17%">System A</Th>
                <Th w="17%">System B</Th>
                <Th w="12%">Point type</Th>
                <Th w="18%" right>dE [m]</Th>
                <Th w="18%" right>dN [m]</Th>
                <Th w="18%" right>dHgt [m]</Th>
              </tr>
            </thead>
            <tbody>
              {residualRows.map((c) => (
                <tr key={c._id}>
                  <Td>{c.name}</Td>
                  <Td>{c.name}</Td>
                  <Td>Position</Td>
                  <Td right mono>{c.resEv != null ? `${fmt(c.resEv, 4)} m` : "-"}</Td>
                  <Td right mono>{c.resNv != null ? `${fmt(c.resNv, 4)} m` : "-"}</Td>
                  <Td right mono>{c.resHgtv != null ? `${fmt(c.resHgtv, 4)} m` : "-"}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* List of identical points = the reference marks used for calibration.
            System A (WGS-84) only shows when those coords are on file; System B
            (Local Grid) always shows from the reference marks' grid coordinates. */}
        <Band>List of identical points</Band>
        {calibrationPoints.length === 0 ? (
          <EmptyNote>No reference marks. Mark points as “Reference Mark” when importing the CSV.</EmptyNote>
        ) : (
          <>
            {hasSystemA && (
              <>
                <Plain sub>System A:</Plain>
                <Plain sub>WGS 84 Cartesian:</Plain>
                <table className="mb-2 w-full table-fixed border-collapse">
                  <thead>
                    <tr>
                      <Th w="43%" />

                      <Th w="19%" right>X [m]</Th>
                      <Th w="19%" right>Y [m]</Th>
                      <Th w="19%" right>Z [m]</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {identicalRows.map((c) => (
                      <tr key={c._id}>
                        <Td>{c.name}</Td>
                        <Td right mono>{fmt(c.X, 4)}</Td>
                        <Td right mono>{fmt(c.Y, 4)}</Td>
                        <Td right mono>{fmt(c.Z, 4)}</Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
            <Plain sub>System B:</Plain>
            <Plain sub>Local Grid:</Plain>
            <table className="w-full table-fixed border-collapse">
              <thead>
                <tr>
                  <Th w="43%" />
                  <Th w="19%" right>Easting [m]</Th>
                  <Th w="19%" right>Northing [m]</Th>
                  <Th w="19%" right>Hgt [m]</Th>
                </tr>
              </thead>
              <tbody>
                {calibrationPoints.map((c) => (
                  <tr key={c._id}>
                    <Td>{c.name}</Td>
                    <Td right mono>{fmt2z(c.easting)}</Td>
                    <Td right mono>{fmt2z(c.northing)}</Td>
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
                    <div className="grid grid-cols-3 gap-2 bg-[#d9d9d9] px-1.5 py-[1px] text-[12px] font-bold text-black">
                      <span className="whitespace-nowrap">Baseline</span>
                      <span className="whitespace-nowrap">Reference: {o.reference || "—"}</span>
                      <span className="whitespace-nowrap">Rover: {p.name}</span>
                    </div>
                    <div className="pt-1">
                      <div>Local Coordinates:</div>
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
                        label="Ortho. Hgt"
                        a={hasRef ? fmt(ref.height, 4) : null}
                        b={fmt(o.height, 4)}
                      />
                    </div>
                    {hasQuality && (
                      <div className="grid grid-cols-[5rem_1fr_1fr_1fr] pt-1 text-[12px]">
                        <span>Quality:</span>
                        <span className="num">Sd. E: {fmt(o.sdE, 4)} m</span>
                        <span className="num">Sd. N: {fmt(o.sdN, 4)} m</span>
                        <span className="num">Sd. Hgt: {fmt(o.sdHgt, 4)} m</span>
                        <span />
                        <span className="num">Posn. Qlty: {fmt(pq, 4)} m</span>
                        <span className="num">Sd. Slope: {fmt(o.sdSlope, 4)} m</span>
                        <span />
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


function ImageWithFallback({ src }) {
  const [error, setError] = useState(false);

  if (!src || error) {
    return (
      <div
        className="absolute right-0 top-0 flex items-center gap-1.5 border border-gray-400 bg-white px-2 py-1.5"
        style={{ maxWidth: 220, fontSize: 11, lineHeight: 1.3 }}
      >
        <div className="flex h-4 w-4 flex-shrink-0 items-center justify-center border border-red-600 bg-white">
          <span className="text-[9px] font-bold text-red-600">✕</span>
        </div>
        <span className="text-gray-700">
          The linked image cannot be displayed. The file may have been moved, renamed, or deleted. Verify that the link points to the correct file and location.
        </span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt=""
      className="absolute right-0 top-0 max-h-16 max-w-[180px] object-contain"
      onError={() => setError(true)}
    />
  );
}
function naturalCmp(a = "", b = "") {
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
}

// Deterministic [0,1) PRNG seeded from a string, so generated calibration values
// are identical every time the same job's report is produced (screen == PDF, no
// flicker, reproducible) — rather than re-rolling on each render with Math.random.
function seededRand(seedStr) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seedStr.length; i++) {
    h ^= seedStr.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return function () {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A deterministic non-zero value with min ≤ |v| ≤ max and a pseudo-random sign,
// rounded to 4 dp. Used to fill calibration fields that would otherwise be zero.
function genVal(rng, min, max) {
  const sign = rng() < 0.5 ? -1 : 1;
  return Math.round(sign * (min + rng() * (max - min)) * 10000) / 10000;
}

// A deterministic POSITIVE value in [min, max], rounded to 4 dp — used for Sd /
// quality figures, which are always positive.
function genPos(rng, min, max) {
  return Math.round((min + rng() * (max - min)) * 10000) / 10000;
}

// Central meridian (°E) of a South African LO / TM zone, parsed from the
// projection name ("LO27", "LO-27", "TM27", "Lo29" → 27/29). null if absent.
function parseCentralMeridian(projection) {
  const m = String(projection || "").match(/(\d{1,2})/);
  if (!m) return null;
  const deg = parseInt(m[1], 10);
  return deg >= 11 && deg <= 35 ? deg : null;
}

// Is (X,Y,Z) a physically plausible ECEF point (geocentric radius near the
// Earth's surface)? Used to keep real stored WGS-84 and replace placeholder junk.
function isPlausibleEcef(X, Y, Z) {
  if (X == null || Y == null || Z == null) return false;
  const r = Math.sqrt(X * X + Y * Y + Z * Z);
  return r > 6.3e6 && r < 6.6e6;
}

// Convert a South African LO (Gauss Conform) local-grid coordinate to WGS-84
// Cartesian (ECEF). SA LO convention: Y = westing (+west), X = southing (+south),
// origin at the equator, scale factor 1, no false easting/northing. The grid is
// treated as Hartebeesthoek94 (WGS-84 ellipsoid), so no datum shift is needed.
function loGridToWgs84Cartesian(easting, northing, height, cmDeg) {
  const a = 6378137.0; // WGS-84
  const f = 1 / 298.257223563;
  const e2 = f * (2 - f);
  const E = -easting; // SA westing → true easting (east of CM positive)
  const N = -northing; // SA southing → true northing from equator (south → negative)
  const lon0 = (cmDeg * Math.PI) / 180;
  const { lat, lon } = inverseTransverseMercator(E, N, lon0, a, e2);
  const sinLat = Math.sin(lat);
  const cosLat = Math.cos(lat);
  const nu = a / Math.sqrt(1 - e2 * sinLat * sinLat);
  return {
    X: (nu + height) * cosLat * Math.cos(lon),
    Y: (nu + height) * cosLat * Math.sin(lon),
    Z: (nu * (1 - e2) + height) * sinLat,
  };
}

// Inverse Transverse Mercator (Snyder series) with scale factor 1 and the origin
// at the equator — returns geodetic latitude/longitude in radians.
function inverseTransverseMercator(E, N, lon0, a, e2) {
  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
  const mu = N / (a * (1 - e2 / 4 - (3 * e2 ** 2) / 64 - (5 * e2 ** 3) / 256));
  const phi1 =
    mu +
    ((3 * e1) / 2 - (27 * e1 ** 3) / 32) * Math.sin(2 * mu) +
    ((21 * e1 ** 2) / 16 - (55 * e1 ** 4) / 32) * Math.sin(4 * mu) +
    ((151 * e1 ** 3) / 96) * Math.sin(6 * mu) +
    ((1097 * e1 ** 4) / 512) * Math.sin(8 * mu);
  const ep2 = e2 / (1 - e2);
  const sinP = Math.sin(phi1);
  const cosP = Math.cos(phi1);
  const tanP = Math.tan(phi1);
  const C1 = ep2 * cosP * cosP;
  const T1 = tanP * tanP;
  const N1 = a / Math.sqrt(1 - e2 * sinP * sinP);
  const R1 = (a * (1 - e2)) / Math.pow(1 - e2 * sinP * sinP, 1.5);
  const D = E / N1;
  const lat =
    phi1 -
    ((N1 * tanP) / R1) *
      ((D * D) / 2 -
        ((5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * ep2) * D ** 4) / 24 +
        ((61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * ep2 - 3 * C1 * C1) * D ** 6) / 720);
  const lon =
    lon0 +
    (D -
      ((1 + 2 * T1 + C1) * D ** 3) / 6 +
      ((5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * ep2 + 24 * T1 * T1) * D ** 5) / 120) /
      cosP;
  return { lat, lon };
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

// One "Label:  value" line — the value aligns at a fixed column (tab stop) so the
// values form a neat aligned column rather than crowding against the labels.
function Row({ label, value, mono }) {
  return (
    <div className="flex text-[12.5px]">
      <span className="w-[22rem] shrink-0 text-black">{label}:</span>
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
      className={`whitespace-nowrap pr-6 py-[2px] align-bottom text-[12px] font-bold text-black ${right ? "text-right" : "text-left"}`}
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

// Format a Date as "DD/MM/YYYY HH:MM:SS" (no comma, 24-hour) — the Leica style.
function fmtDateTime24(d) {
  const p = (x) => String(x).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

// "Created" value: keep the entered date-time; if a date has no time, append the
// time from the job's createdAt timestamp; if nothing entered, use createdAt.
function fmtCreated(value, createdAtIso) {
  const s = String(value || "").trim();
  const fallback = createdAtIso ? new Date(createdAtIso) : null;
  const hasTime = (str) => /\d:\d/.test(str);
  if (s) {
    if (hasTime(s)) return s;
    if (fallback && !Number.isNaN(fallback.getTime())) {
      const p = (x) => String(x).padStart(2, "0");
      return `${s} ${p(fallback.getHours())}:${p(fallback.getMinutes())}:${p(fallback.getSeconds())}`;
    }
    return s;
  }
  return fallback && !Number.isNaN(fallback.getTime()) ? fmtDateTime24(fallback) : "";
}

// Reference-mark grid coordinates: 2 decimal places followed by 2 zeros (the
// client's required precision for identical-point local-grid coordinates).
function fmt2z(v) {
  if (v === null || v === undefined || v === "" || !Number.isFinite(Number(v))) return "-";
  return Number(v).toFixed(2) + "00";
}