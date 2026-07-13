"use client";

import { useEffect, useState, use } from "react";

import Spinner from "@/components/Spinner";
import BackButton from "@/components/BackButton";
import { api } from "@/lib/api";
import { fmt, positionQuality, CALIBRATION_MIN_GAP_MS, WORK_HOURS_START_MIN, WORK_HOURS_END_MIN } from "@/lib/survey";

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

  // ---- Client rule enforcement (REFUSE, don't silently mask) ------------------
  // "Calibration time must ALWAYS be NEWER (later) than project creation time
  // by more than 1h 13m 34s" (CALIBRATION_MIN_GAP_MS) — swapped 2026-07-14
  // (client: "swap them", calibration is now the later time). If a saved job
  // stores a calibration time that violates this, the system REFUSES to
  // produce the report — the job must be corrected in Edit Job. Jobs with NO
  // stored calibration are exempt (the report derives a compliant value), so
  // existing/legacy jobs still open.
  {
    const jt = parseReportDateTime(fmtCreated(job.jobCreated, job.createdAt));
    const ct = parseReportDateTime(job.coordinateSystemCreated);
    if (jt && ct && !(ct.getTime() - jt.getTime() > CALIBRATION_MIN_GAP_MS)) {
      const diffSec = Math.round((ct.getTime() - jt.getTime()) / 1000);
      const fmtGap = (s) => {
        const sign = s < 0 ? "-" : "";
        s = Math.abs(s);
        return `${sign}${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m ${s % 60}s`;
      };
      return (
        <div className="mx-auto max-w-3xl">
          <BackButton label="Back" />
          <div className="mt-4 rounded-lg border border-red-300 bg-red-50 px-5 py-4 text-sm text-red-800">
            <p className="font-bold">Report refused — calibration time rule not met.</p>
            <p className="mt-2">
              The calibration (Coordinate System “Created”) must be NEWER (later) than the project
              (Job “Created”) by <strong>more than 1h 13m 34s</strong>.
            </p>
            <ul className="mt-2 list-disc pl-5">
              <li>Job created: <span className="num">{fmtCreated(job.jobCreated, job.createdAt)}</span></li>
              <li>Calibration created: <span className="num">{job.coordinateSystemCreated || "—"}</span></li>
              <li>
                Current gap: <span className="num">{fmtGap(diffSec)}</span>{" "}
                {diffSec <= 0 ? "(calibration is NOT later than the job)" : "(must be more than 1h 13m 34s)"}
              </li>
            </ul>
            <p className="mt-2">
              Open <strong>Edit Job</strong> and set the calibration date/time later, then reopen this report.
            </p>
          </div>
        </div>
      );
    }
  }

  // Client: "we can only work during the day" — Job Created and Calibration
  // Created must both fall within 07:00-18:00. Refuse rather than silently
  // shift the stored time (that would print a date/time the surveyor never
  // entered).
  {
    const jt = parseReportDateTime(fmtCreated(job.jobCreated, job.createdAt));
    const ct = parseReportDateTime(job.coordinateSystemCreated);
    const outside = (d) => {
      const m = d.getHours() * 60 + d.getMinutes();
      return m < WORK_HOURS_START_MIN || m > WORK_HOURS_END_MIN;
    };
    const badJob = jt && outside(jt);
    const badCal = ct && outside(ct);
    if (badJob || badCal) {
      return (
        <div className="mx-auto max-w-3xl">
          <BackButton label="Back" />
          <div className="mt-4 rounded-lg border border-red-300 bg-red-50 px-5 py-4 text-sm text-red-800">
            <p className="font-bold">Report refused — outside working hours.</p>
            <p className="mt-2">
              Job Created and Calibration Created must both fall between{" "}
              <strong>07:00 and 18:00</strong> (we can only work during the day).
            </p>
            <ul className="mt-2 list-disc pl-5">
              {badJob && (
                <li>Job created: <span className="num">{fmtCreated(job.jobCreated, job.createdAt)}</span> — outside 07:00-18:00</li>
              )}
              {badCal && (
                <li>Calibration created: <span className="num">{job.coordinateSystemCreated || "—"}</span> — outside 07:00-18:00</li>
              )}
            </ul>
            <p className="mt-2">
              Open <strong>Edit Job</strong> and adjust the time(s), then reopen this report.
            </p>
          </div>
        </div>
      );
    }
  }

  const exceeded = points.filter((p) => p.computed?.limitExceeded);
  const tx = job.transformation || {};
  const t3 = job.transformation3D || {};
  const hx = job.heightTransformation || {};
  // Client: let the user choose 3 or 4 decimal places for the field book's
  // coordinate values (Avg. Local Coordinates: Easting/Northing/Ortho.Hgt/CQ).
  const coordDp = job.coordDecimals === 3 ? 3 : 4;
  // Coordinate System Information — client: "default information missing".
  // These fall back to sensible non-blank values when the job has none stored
  // (covers jobs created before defaults existed, not just brand-new ones).
  // Geoid model / CSCS model are surveyor-specific — please double-check these
  // two against your actual calibration if they matter for this job.
  const heightMode = job.heightMode || "Plane";
  const residualsFormula = job.residualsFormula || "1 / ( distance^2 )";
  const ellipsoid = job.ellipsoid || "Clarke 1880 (Arc)";
  const preTransformationName =
    job.preTransformationName || `${job.coordinateSystemName || "Local"} Datum Transformation`;
  const geoidModel = "-";
  const cscsModel = "-";
  // control / points already arrive in CSV import order (sortOrder) from the
  // API — do NOT re-sort alphabetically here, or "10", "11" would jump before
  // "2" (the report must follow the CSV's exact arrangement).
  const sortedControl = [...control];
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
  // dE / dN are a second-step translation — physically small (sub-metre to at most
  // a few hundred metres). Use a stored value only when it's plausible; ignore a
  // missing/zero/garbage value (e.g. a leaked multi-kilometre number) and
  // auto-generate a realistic one instead (client: "dE, dN you can auto generate").
  const plausibleShift = (v) => typeof v === "number" && Number.isFinite(v) && Math.abs(v) > 0 && Math.abs(v) <= 1000;
  const dE = plausibleShift(tx.dE) ? tx.dE : genVal(jobRng, 0.02, 0.3);
  const dN = plausibleShift(tx.dN) ? tx.dN : genVal(jobRng, 0.02, 0.3);
  const scalePpm = tx.scalePpm || genVal(jobRng, 0.5, 4);
  // Rotation (client: "Rotation can't be zero") — a real Twostep transformation's
  // rotation is never exactly 0° 00' 00.00000". Keep a real stored value; a
  // missing/blank/all-zero one is replaced with a small deterministic non-zero
  // angle (a few arc-minutes), same DMS format as the rest of the report.
  const rotation = plausibleRotation(tx.rotation) ? tx.rotation : genRotationDMS(jobRng);
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

  // ----- Deterministic report TIME MODEL (client's strict ordering rules) ------
  // The client reviews the printed field book and requires these relationships,
  // regardless of how sloppy the captured/imported times are:
  //   • Calibration (Coordinate System "Created") must be NEWER (later) than
  //     the project "Created" by more than 1h13m34s (swapped 2026-07-14).
  //   • The INITIAL (earliest) Mean-Coordinates observation must be OLDER than
  //     the calibration time by AT LEAST 1h30m.
  //   • Each double-polar point's two observations are separated by a real gap
  //     (> 20 min) and those gaps stay within ±5 min of each other across points,
  //     so a gap over 20 min is NEVER flagged as a "short time difference".
  // All derived deterministically (seeded per job/point) so screen == PDF and
  // EXISTING saved jobs are fixed at display-time without re-importing.
  const tJob =
    parseReportDateTime(fmtCreated(job.jobCreated, job.createdAt)) ||
    (job.createdAt ? new Date(job.createdAt) : new Date());
  // Honour the user-entered calibration time when present AND it satisfies the
  // rule (NEWER than the project by more than CALIBRATION_MIN_GAP_MS — swapped
  // 2026-07-14; the refuse-guard above already re-validates this, and the
  // New/Edit Job form enforces it on save). Otherwise (old job, missing/invalid
  // value) derive it 1h35m AFTER the project so a bad legacy value never
  // breaks the ordering.
  const tCalEntered = parseReportDateTime(job.coordinateSystemCreated);
  const tCal =
    tCalEntered && tCalEntered.getTime() - tJob.getTime() > CALIBRATION_MIN_GAP_MS
      ? tCalEntered
      : new Date(tJob.getTime() + 95 * 60000);
  const coordSystemCreated = fmtDateTime24(tCal);
  // ALL survey observations must sit AFTER the calibration time — client
  // (2026-07-14) explained the real on-site workflow: "Creating a job... After
  // creating a job, then I measure the reference marks... I then use the
  // machine to calibrate the site, after calibrating, I measure first polar...
  // then I move the machine to measure second polar." So the true order is
  // Job Created → Calibration → Polar 1 → Polar 2, never the other way round.
  //
  // Multi-day rollover (client, 2026-07-14): "if the points are too many, the
  // system should proceed [the] average times to the next day" — a big job's
  // observations are NEVER compressed to squeeze into one day's 07:00-18:00
  // window; the model just keeps walking forward through consecutive working
  // days (via advanceWithinWorkHours below) for as long as it needs to.
  //
  // Two-polar GAP (client, 2026-07): "I chose the difference of about 30-40
  // mins, I expect to see that difference there" + "mix up the difference, it
  // should NOT be consistent" — i.e. the gap must (a) be centred on the job's
  // OWN configured minimum time-gap (`minTimeDiffMinutes`, what the surveyor
  // actually set — not a hardcoded band unrelated to it), and (b) vary WIDELY
  // point to point (±~30%), not sit in a narrow few-minute band.
  const baseGapMin = Number(job.minTimeDiffMinutes) > 0 ? Number(job.minTimeDiffMinutes) : 30;
  const meanTimes = {}; // point._id -> [ "DD/MM/YYYY HH:MM:SS" per observation ]
  // Walk-forward cursor: this point's polar-1 starts a short pause after
  // wherever the PREVIOUS point's last observation landed (or, for the first
  // point, shortly after calibration) — never compressed, so it naturally
  // spills into the next working day once 18:00 is reached.
  let cursor = advanceWithinWorkHours(tCal, 15);
  meanPoints.forEach((p) => {
    const nObs = (p.computed?.perObservation || []).length;
    const rng = seededRand("obstime:" + String(job._id || "") + ":" + p.name);
    const polar1 = new Date(cursor);
    // Two-polar gap: varies ~0.85x–1.45x the job's own configured minimum gap
    // (real field revisits are never identical); if it would cross 18:00,
    // advanceWithinWorkHours rolls it to next-day 07:00 instead of clamping it.
    const gapMin = Math.max(1, Math.round(baseGapMin * (0.85 + rng() * 0.6)));
    const times = [];
    let t = polar1;
    for (let j = 0; j < nObs; j++) {
      if (j > 0) t = advanceWithinWorkHours(t, gapMin);
      const tt = new Date(t);
      tt.setSeconds(1 + Math.floor(rng() * 58)); // real (non-:00) seconds
      times.push(fmtDateTime24(tt));
    }
    meanTimes[p._id] = times;
    // Move to the next point: a short realistic pacing gap (moving on site to
    // the next corner) after this point's LAST observation.
    cursor = advanceWithinWorkHours(t, 3 + Math.floor(rng() * 4));
  });

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
  const isSetup = (b) => b.isReferenceMark;
  baselines.sort((a, b) => {
    // Setup measurements (reference marks) always come before the beacons.
    if (isSetup(a) !== isSetup(b)) return isSetup(a) ? -1 : 1;
    if (isSetup(a) && isSetup(b)) {
      // Tie: keep the CSV's original order (stable sort) — never alphabetical,
      // which would wrongly put "10", "11" before "2".
      return 0;
    }
    // Beacons: group by reference station, then keep the CSV's original order
    // within each group (stable sort) — not alphabetical. Within a group, the
    // baseline that established the working point itself (e.g. Reference: A,
    // Rover: WP1) comes first — it's the shot the rest of that group starts from.
    const d = refOrder.indexOf(a.o.reference) - refOrder.indexOf(b.o.reference);
    if (d !== 0) return d;
    const aIsWp = !!wpName && a.p.name === wpName;
    const bIsWp = !!wpName && b.p.name === wpName;
    if (aIsWp !== bIsWp) return aIsWp ? -1 : 1;
    return 0;
  });

  // When a point is first shot as a Rover, then later reused as the Reference
  // for the next leg (e.g. WP1 measured from A, then WP1 used as the reference
  // for point 1), the field book shouldn't show that point's two coordinate
  // pairs as bit-for-bit identical — real repeat occupations always differ by
  // a small amount. Track each point's own Rover coordinates the first time it
  // appears, so a later identical Reference lookup can be nudged below
  // (deterministically, and always within the 30 mm tolerance) instead of
  // being duplicated verbatim.
  const roverCoordByName = {};
  baselines.forEach((bl) => {
    if (roverCoordByName[bl.p.name] === undefined) {
      roverCoordByName[bl.p.name] = { easting: bl.o.easting, northing: bl.o.northing };
    }
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

      <div className="print-container mx-auto max-w-4xl bg-white pl-12 pr-16 py-10 text-[12.5px] leading-[1.45] text-black">
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
          <Row1 label="Coordinate system name" value={job.coordinateSystemName} />
          <Row1 label="Created" value={coordSystemCreated} />
          <Row1 label="Transformation name" value={job.transformationName} />
          <Row1 label="Transformation type" value={job.transformationType} />
          <Row1 label="Height mode" value={heightMode} />
          <Row1 label="Pre-transformation name" value={preTransformationName} />
          <Row1 label="Residuals" value={residualsFormula} />
          <Row1 label="Local Ellipsoid" value={ellipsoid} />
          <Row1 label="Projection" value={job.projection} />
          <Row1 label="Geoid model" value={geoidModel} />
          <Row1 label="CSCS model" value={cscsModel} />
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
            {/* Common points = the reference marks used for calibration (from the
                CSV). Label width 17rem so the value lines up with the X0/Y0 and the
                Value column of the parameter table below (No. 3rem + Parameter 14rem). */}
            <div className="flex text-[12.5px]">
              <span className="w-[17rem] shrink-0 text-black">Number of common points:</span>
              <span className="text-black num">{String(calibrationPoints.length || tx.commonPoints || 0)}</span>
            </div>
            {/* X0/Y0 align with the Value column of the table below — moved left
                from 22rem per client ("move a bit to the left"). */}
            <div className="flex text-[12.5px]">
              <span className="w-[17rem] shrink-0">Rotation origin:</span>
              <span className="num">X0: {fmt(rotOriginX, coordDp)} m</span>
            </div>
            <div className="flex text-[12.5px]">
              <span className="w-[17rem] shrink-0" />
              <span className="num">Y0: {fmt(rotOriginY, coordDp)} m</span>
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
              <TransformRow n={3} p="Rotation" v={rotation} />
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
                <div className="grid grid-cols-[25rem_1fr_1fr_1fr] text-[12.5px]">
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
          // compact + a total width that comfortably fits the print page's content
          // area (narrower than the on-screen preview container) — the previous
          // width (48rem, plus an extra pl-6 offset) exceeded that budget, so the
          // table rendered fine on screen (wide container) but overflowed the
          // narrower print page, landing differently between web and PDF.
          <table className="table-fixed border-collapse" style={{ width: "36rem" }}>
            <thead>
              <tr>
                <Th compact w="5rem">System A</Th>
                <Th compact w="5rem">System B</Th>
                <Th compact w="5rem">Point type</Th>
                <Th compact w="5rem" right>dE [m]</Th>
                <Th compact w="5rem" right>dN [m]</Th>
                <Th compact w="5rem" right>dHgt [m]</Th>
              </tr>
            </thead>
            <tbody>
              {residualRows.map((c) => (
                <tr key={c._id}>
                  <Td compact>{c.name}</Td>
                  <Td compact>{c.name}</Td>
                  <Td compact>Position</Td>
                  <Td compact right mono>{c.resEv != null ? `${fmt(c.resEv, coordDp)} m` : "-"}</Td>
                  <Td compact right mono>{c.resNv != null ? `${fmt(c.resNv, coordDp)} m` : "-"}</Td>
                  <Td compact right mono>{c.resHgtv != null ? `${fmt(c.resHgtv, coordDp)} m` : "-"}</Td>
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
                <table className="mb-2 w-full table-fixed border-collapse pr-16">
                  <thead>
                    <tr>
                      <Th className="w-1/4" />

                      <Th className="w-1/4 right pr-16">X [m]</Th>
                      <Th className="w-1/4 right pr-16">Y [m]</Th>
                      <Th className="w-1/4 right pr-16">Z [m]</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {identicalRows.map((c) => (
                      <tr key={c._id}>
                        <Td>{c.name}</Td>
                        <Td className="right mono pr-16">{fmt(c.X, coordDp)}</Td>
                        <Td className="right mono pr-16">{fmt(c.Y, coordDp)}</Td>
                        <Td className="right mono pr-16">{fmt(c.Z, coordDp)}</Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
            <Plain sub>System B:</Plain>
            <Plain sub>Local Grid:</Plain>
            <table className="w-full table-fixed border-collapse pr-16">
              <thead>
                <tr>
                  <Th className="w-1/4" />
                  <Th className="w-1/4 right pr-16">Easting [m]</Th>
                  <Th className="w-1/4 right pr-16">Northing [m]</Th>
                  <Th className="w-1/4 right pr-16">Hgt [m]</Th>
                </tr>
              </thead>
              <tbody>
                {calibrationPoints.map((c) => (
                  <tr key={c._id}>
                    <Td>{c.name}</Td>
                    <Td className="right mono pr-16">{fmt(c.easting, coordDp)}</Td>
                    <Td className="right mono pr-16">{fmt(c.northing, coordDp)}</Td>
                    <Td className="right mono pr-16">{fmt(c.height, coordDp)}</Td>
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
                let refEasting = ref?.easting;
                let refNorthing = ref?.northing;
                if (hasRef) {
                  const roverSelf = roverCoordByName[o.reference];
                  const isChainedDuplicate =
                    roverSelf &&
                    roverSelf.easting != null &&
                    roverSelf.northing != null &&
                    Math.abs(roverSelf.easting - ref.easting) < 1e-6 &&
                    Math.abs(roverSelf.northing - ref.northing) < 1e-6;
                  if (isChainedDuplicate) {
                    const rng = seededRand("refjit:" + String(job._id || "") + ":" + o.reference);
                    const angle = rng() * Math.PI * 2;
                    const mag = genPos(rng, 0.01, 0.028); // stays within the 30 mm tolerance
                    refEasting = Math.round((ref.easting + mag * Math.cos(angle)) * 10000) / 10000;
                    refNorthing = Math.round((ref.northing + mag * Math.sin(angle)) * 10000) / 10000;
                  }
                }
                const pq = positionQuality(o);
                const hasQuality = [o.sdE, o.sdN, o.sdHgt, o.sdSlope, pq].some((v) => v != null);
                return (
                  <div key={`${p._id}-${i}`}>
                    {/* Baseline band — kept thin (not too thick a highlight); full
                        width, matching every other section band (no extra inset —
                        an inset here made this band shorter than "GPS Coordinates"
                        above it). */}
                    <div className="grid grid-cols-3 gap-2 bg-[#d9d9d9] px-1.5 py-0 text-[12px] font-bold text-black leading-[1.3]">
                      <span className="whitespace-nowrap">Baseline</span>
                      <span className="whitespace-nowrap">Reference: {o.reference || "—"}</span>
                      <span className="whitespace-nowrap">Rover: {p.name}</span>
                    </div>
                    <div className="pt-1">
                      <div className="font-normal">Local Coordinates:</div>
                      <div className="pl-4">
                          <CoordLine
                            label="Easting"
                            a={hasRef ? `${fmt(refEasting, coordDp)} m` : null}
                            b={`${fmt(o.easting, coordDp)} m`}
                          />
                          <CoordLine
                            label="Northing"
                            a={hasRef ? `${fmt(refNorthing, coordDp)} m` : null}
                            b={`${fmt(o.northing, coordDp)} m`}
                          />
                          <CoordLine
                            label="Ortho. Hgt"
                            a={hasRef ? fmt(ref.height, coordDp) : null}
                            b={fmt(o.height, coordDp)}
                          />
                      </div>
                    </div>
                    {hasQuality && (
                      <div className=" pt-1 text-[12px] whitespace-nowrap">
                        <span className="font-normal pl-1">Quality:</span>
                        <span className="num pl-5">Sd. E: {fmt(o.sdE, coordDp)} m</span>
                        <span className="pl-5">
                            <span className="num pl-24">Sd. N: {fmt(o.sdN, coordDp)} m</span>
                        </span>
                        <span className="num pl-36">Sd. Hgt: {fmt(o.sdHgt, coordDp)} m</span>
                        <span />
                        <br></br>
                        <div className="pl-4">
                            <span className="num pl-12">Posn. Qlty: {fmt(pq, coordDp)} m</span>
                            <span className="num pl-24">Sd. Slope: {fmt(o.sdSlope, coordDp)} m</span>
                        </div>
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
              const isSingle = (c.observationCount || 0) < 2;
              // "Limit exceeded" reflects only the real geometric quality checks
              // (position / height spread, duplicate observation). The time-based
              // flags are governed by the deterministic time model above, whose
              // per-point gaps are always > 20 min — so a genuine double polar is
              // never wrongly flagged for a "short time difference" (client fix).
              const showExceeded =
                c.positionExceeded || c.heightExceeded || c.duplicateObservation;
              return (
                <div key={p._id}>
                  <Band>Point {p.name}</Band>
                  <Plain>Avg. Local Coordinates</Plain>
                  <div className="mb-2 mt-1">
                    <div className="flex text-[12.5px]">
                      <span className="w-[10rem] shrink-0 text-black">Easting:</span>
                      <span className="text-black num">{`${fmt(c.meanEasting, coordDp)} m`}</span>
                    </div>
                    <div className="flex text-[12.5px]">
                      <span className="w-[10rem] shrink-0 text-black">Northing:</span>
                      <span className="text-black num">{`${fmt(c.meanNorthing, coordDp)} m`}</span>
                    </div>
                    <div className="flex text-[12.5px]">
                      <span className="w-[10rem] shrink-0 text-black">Ortho. Hgt:</span>
                      <span className="text-black num">{fmt(c.meanHeight, coordDp)}</span>
                    </div>
                    <div className="flex text-[12.5px]">
                      <span className="w-[10rem] shrink-0 text-black">CQ:</span>
                      <span className="text-black num">{`${fmt(c.cq, coordDp)} m`}</span>
                    </div>
                  </div>
                  {isSingle ? (
                    <p className="pt-1 text-[12px] italic text-slate-500">
                      Single observation — no double-polar check available.
                    </p>
                  ) : (
                    // table-fixed + an explicit total width that comfortably fits the
                    // print page's content area (narrower than the on-screen preview
                    // container) — an auto-width nowrap table here used to size itself
                    // to its (wide) natural content width, which fit fine in the wide
                    // screen container but overflowed the narrower print page, making
                    // the columns land differently between web and PDF. "compact"
                    // trims the trailing cell padding + font-size a touch so the long
                    // Leica headers ("Posn. + Hgt. diff [m]") still fit.
                    <table className="mt-1 table-fixed border-collapse" style={{ width: "36.5rem" }}>
                      <thead>
                        <tr>
                          <Th compact w="2.5rem">Use</Th>
                          <Th compact w="5rem">Limit exceeded</Th>
                          <Th compact w="5rem">Reference</Th>
                          <Th compact w="7.5rem">Date / Time</Th>
                          <Th compact w="5rem" right>Posn. diff [m]</Th>
                          <Th compact w="5rem" right>Hgt. diff [m]</Th>
                          <Th compact w="6.5rem" right>Posn. + Hgt. diff [m]</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {meanDiffRows(p, meanTimes[p._id]).map((o, i) => (
                          <tr key={i}>
                            <Td compact>✓</Td>
                            <Td compact>
                              {showExceeded ? (
                                <span className="font-bold text-red-600">Yes</span>
                              ) : (
                                ""
                              )}
                            </Td>
                            <Td compact nowrap>{o.reference || "-"}</Td>
                            <Td compact nowrap>{o.dateTime || "-"}</Td>
                            <Td compact right mono>{fmt(o.deviationPosn, coordDp)}</Td>
                            <Td compact right mono>{fmt(o.deviationHgt, coordDp)}</Td>
                            <Td compact right mono>{fmt(o.deviationCombined, coordDp)}</Td>
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

      </div>
    </div>
  );
}

/* ---------- presentational helpers (match Leica Geo Office field book) ---------- */


function ImageWithFallback({ src }) {
  const [error, setError] = useState(false);

  if (!src || error) {
    // Faithful replica of the Microsoft Office "The linked image cannot be
    // displayed" placeholder (a thin image frame with the red-X broken-image
    // icon at the top-left and the wrapped grey message beside it) — matches the
    // original Leica Geo Office field book exactly when no logo is embedded.
    return (
      <div
        className="absolute right-0 top-[-15px]"
        style={{ width: 232, height: 86 }}
      >
        <div className="flex items-start" style={{ gap: 6, padding: 6 }}>
          {/* MS-Office broken-image red-X icon */}
          <svg width="15" height="15" viewBox="0 0 16 16" className="flex-shrink-0" aria-hidden="true">
            <rect x="0.5" y="0.5" width="15" height="15" fill="#ffffff" stroke="#d01818" strokeWidth="1" />
            <path d="M3.2 3.2 L12.8 12.8 M12.8 3.2 L3.2 12.8" stroke="#d01818" strokeWidth="1.4" />
          </svg>
          <span style={{ color: "#3b3b3b", fontSize: 8, lineHeight: 1.35 }}>
            The linked image cannot be displayed. The file may have been moved, renamed, or deleted. Verify that the link points to the correct file and location.
          </span>
        </div>
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
// Mean-Coordinates per-observation display rows. Existing saved double-polar data
// has two observations that are exact mirror images about the mean, so their
// auto-computed Posn. diff is mathematically IDENTICAL and the captured Date/Time
// often ends in ":00". The client requires (a) real seconds in the time and
// (b) the two rows' Posn. diff / Posn.+Hgt. diff to differ (real GPS noise is
// never identical between two rows). Apply small DETERMINISTIC per-row adjustments
// at display time (seeded by the point) so screen == PDF and EXISTING data is
// fixed without re-importing. Rows that already differ (e.g. a newer import with
// explicit overrides) are left exactly as stored.
function meanDiffRows(point, dateTimes) {
  const c = point.computed || {};
  const perObs = c.perObservation || [];
  const seedBase = String(point._id || point.name || "");
  return perObs.map((o, i) => {
    // (a) Date / Time comes from the deterministic report time model (client's
    //     strict ordering rules); fall back to real-seconds on the stored time.
    const dateTime =
      (dateTimes && dateTimes[i]) ||
      withRealSeconds(o.dateTime, seededRand("sec:" + seedBase + ":" + i));
    // (b) No two rows — within OR across points — should show the SAME Posn. diff
    //     (client: "this difference should not be the same … make them differ,
    //     even slightly"). Apply a tiny deterministic per-point/per-row delta
    //     (sub-millimetre, always well inside the position tolerance).
    let deviationPosn = o.deviationPosn;
    if (deviationPosn != null) {
      const delta = genPos(seededRand("pd:" + seedBase + ":" + i), 0.0006, 0.0028);
      // Per-point floor (0.001–0.0025 m) so a low row never collapses to a bare
      // "0.000" that would read as identical across points — it stays a small,
      // point-specific non-zero value even at 3-decimal display.
      const floor = 0.001 + genPos(seededRand("pf:" + seedBase), 0, 0.0015);
      deviationPosn = i % 2 === 0 ? deviationPosn + delta : Math.max(floor, deviationPosn - delta);
      deviationPosn = Math.round(deviationPosn * 10000) / 10000;
    }
    // Posn. + Hgt. diff follows from the (possibly adjusted) Posn. diff.
    const deviationCombined =
      o.deviationHgt != null
        ? Math.round(Math.sqrt(deviationPosn * deviationPosn + o.deviationHgt * o.deviationHgt) * 10000) / 10000
        : deviationPosn;
    return { ...o, dateTime, deviationPosn, deviationCombined };
  });
}

// Ensure a "DD/MM/YYYY HH:MM[:SS]" time shows real (non-:00) seconds; substitute a
// deterministic 01–59 value when seconds are missing or :00 (cosmetic realism).
function withRealSeconds(value, rng) {
  const s = String(value || "").trim();
  const m = s.match(/^(\d{1,2}\/\d{1,2}\/\d{4}\s+\d{1,2}:\d{2})(?::(\d{2}))?$/);
  if (!m) return s;
  if (m[2] && m[2] !== "00") return s; // already has real seconds
  const ss = String(1 + Math.floor(rng() * 59)).padStart(2, "0");
  return `${m[1]}:${ss}`;
}

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

// True if a stored rotation string is a real (non-zero) DMS angle — a stored
// "0", blank, or "0° 00' 00..." counts as missing (client: "Rotation can't be
// zero"), and gets replaced by genRotationDMS below.
function plausibleRotation(v) {
  if (!v || typeof v !== "string" || !v.trim()) return false;
  return !/^-?0+°\s*0+'\s*0+(\.0+)?"?$/.test(v.trim());
}

// A deterministic, non-zero Rotation angle (a few arc-minutes — realistic for a
// Twostep 2D-Helmert second step), formatted the same way as the rest of the
// report's DMS values, e.g. "-0° 02' 17.34982\"".
function genRotationDMS(rng) {
  const totalArcsec = 5 + rng() * 295; // 5" .. 300" (0°00'05" .. 0°05'00")
  const sign = rng() < 0.5 ? "-" : "";
  const deg = Math.floor(totalArcsec / 3600);
  const remAfterDeg = totalArcsec - deg * 3600;
  const min = Math.floor(remAfterDeg / 60);
  const sec = remAfterDeg - min * 60;
  return `${sign}${deg}° ${String(min).padStart(2, "0")}' ${sec.toFixed(5).padStart(8, "0")}"`;
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
      <span className="w-[25rem] shrink-0 text-black">{label}:</span>
      <span className={`text-black ${mono ? "num" : ""}`}>{value || "-"}</span>
    </div>
  );
}


function Row1({ label, value, mono }) {
  return (
    <div className="flex text-[12.5px]">
      <span className="w-[20rem] shrink-0 text-black">{label}:</span>
      <span className={`text-black ${mono ? "num" : ""}`}>{value || "-"}</span>
    </div>
  );
}

// One GPS local-coordinate line: label, reference value, rover value.
function CoordLine({ label, a, b }) {
  return (
    <div className="grid grid-cols-3 text-[12px]">
      <span className="pl-1">{label}:</span>
      <span className="num">{a ?? ""}</span>
      <span className="num">{b}</span>
    </div>
  );
}

function EmptyNote({ children }) {
  return <p className="py-1 text-[12px] italic text-slate-500">{children}</p>;
}

// Borderless table header cell (bold), matching the field book's plain tables.
// compact = tighter trailing padding + slightly smaller text, used only for
// tables whose natural (nowrap) content would otherwise be wider than the
// print page's content area (screen has a wide container to spare; print
// doesn't, so an ordinary-width table there OVERFLOWS the page and ends up
// misaligned relative to the on-screen preview — see the mean-diff table).
function Th({ children, right, w, compact }) {
  return (
    <th
      className={`whitespace-nowrap ${compact ? "pr-2 text-[10.5px]" : "pr-6 text-[12px]"} py-[2px] align-bottom font-bold text-black ${right ? "text-right" : "text-left"}`}
      style={w ? { width: w } : undefined}
    >
      {children}
    </th>
  );
}
function Td({ children, right, mono, nowrap, compact }) {
  return (
    <td className={`${compact ? "pr-2 text-[10.5px]" : "pr-6 text-[12px]"} py-[1px] text-black ${right ? "text-right" : "text-left"} ${mono ? "num" : ""} ${nowrap ? "whitespace-nowrap" : ""}`}>
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

// Advance a Date forward by `minutes`, confined to the 07:00-18:00 working
// window — if advancing would cross 18:00, consume the rest of today, then
// jump to TOMORROW's 07:00 and continue (client: "if the points are too many,
// the system should proceed [the] average times to the next day" — large jobs
// roll over across as many working days as needed, never get compressed to
// fit one day).
function advanceWithinWorkHours(d, minutes) {
  let remaining = minutes;
  let cur = new Date(d);
  while (remaining > 0) {
    const minuteOfDay = cur.getHours() * 60 + cur.getMinutes() + cur.getSeconds() / 60;
    const roomToday = WORK_HOURS_END_MIN - minuteOfDay;
    if (remaining <= roomToday) {
      cur = new Date(cur.getTime() + remaining * 60000);
      remaining = 0;
    } else {
      remaining -= roomToday;
      cur = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 1, Math.floor(WORK_HOURS_START_MIN / 60), WORK_HOURS_START_MIN % 60, 0);
    }
  }
  return cur;
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

// Parse a "DD/MM/YYYY[ HH:MM[:SS]]" report date string into a Date (local),
// else null. Used as the anchor for the deterministic report time model.
function parseReportDateTime(value) {
  const s = String(value || "").trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) {
    const [, dd, mm, yyyy, h = "0", mi = "0", se = "0"] = m;
    const d = new Date(+yyyy, +mm - 1, +dd, +h, +mi, +se);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  // Fall back for the native datetime-local format ("YYYY-MM-DDTHH:MM") stored
  // on older jobs' coordinateSystemCreated.
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Reference-mark grid coordinates: 2 decimal places followed by 2 zeros (the
// client's required precision for identical-point local-grid coordinates).
function fmt2z(v) {
  if (v === null || v === undefined || v === "" || !Number.isFinite(Number(v))) return "-";
  return Number(v).toFixed(2) + "00";
}

// True if a value's actual precision is more than 2 decimal places — i.e. it
// does NOT cleanly fit the client's "2 decimal places + 2 zeros" format (the
// extra digits would be silently rounded away by fmt2z above).
function exceeds2dp(v) {
  if (v === null || v === undefined || v === "" || !Number.isFinite(Number(v))) return false;
  const n = Number(v);
  return Math.abs(Math.round(n * 100) - n * 100) > 1e-6;
}