/**
 * Survey computation core for the double-polar cadastral workflow.
 *
 * Double polar = every survey point is observed independently from TWO (or more)
 * known reference stations. The independent observations are averaged to a mean
 * coordinate, and their spread is checked against the job tolerances. If the
 * horizontal spread exceeds the Position limit, or the vertical spread exceeds
 * the Height limit, the point is flagged "Limit exceeded" and must be re-surveyed.
 *
 * Pure & isomorphic (no DB / no React). This is the SINGLE SOURCE OF TRUTH for
 * the computation — imported by the app (via @/lib/survey) and by the seed
 * script (via a relative path). It is a .mjs so plain Node can import it too.
 */

export const DEFAULT_POSITION_LIMIT = 0.05; // metres
export const DEFAULT_HEIGHT_LIMIT = 0.075; // metres

// Client's exact minimum gap: the calibration ("Created (Coordinate System)")
// must be older than the project ("Job Created") by MORE than this, or the
// system refuses to save the job (JobForm) / generate the report (report page).
export const CALIBRATION_MIN_GAP_MS = ((1 * 60 + 13) * 60 + 34) * 1000; // 1h 13m 34s

// Minimum time gap required between a point's two double-polar observations.
// A small plot can be re-observed within a few minutes; a farm (much larger,
// the machine drifts more between visits) needs roughly an hour between visits.
export const DEFAULT_MIN_TIME_DIFF_PLOT_MINUTES = 5;
export const DEFAULT_MIN_TIME_DIFF_FARM_MINUTES = 60;

// Field observations must be taken during working hours: 06:00-18:00.
// An observation timestamped outside this window (e.g. 23:56 or 03:55) is
// almost always a data-entry/transcription error and is flagged for review.
export const WORK_HOURS_START_MIN = 6 * 60; // 06:00
export const WORK_HOURS_END_MIN = 18 * 60; // 18:00

export function num(v) {
  if (v === "" || v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

/** Parse "DD/MM/YYYY[ HH:MM[:SS]]" (or anything Date understands) → Date, else null. */
function parseObsDateTime(s) {
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

/** Minutes since midnight (local) for a parsed observation Date. */
function minutesOfDay(d) {
  return d.getHours() * 60 + d.getMinutes();
}

/** True if a parsed observation Date falls outside the 06:00-18:00 working window. */
function isOutsideWorkingHours(d) {
  const m = minutesOfDay(d);
  return m < WORK_HOURS_START_MIN || m > WORK_HOURS_END_MIN;
}

/** Horizontal distance between two {easting, northing} points. */
function dist2D(a, b) {
  const de = a.easting - b.easting;
  const dn = a.northing - b.northing;
  return Math.sqrt(de * de + dn * dn);
}

/** Per-observation horizontal quality: sqrt(sdE^2 + sdN^2). */
export function positionQuality(obs) {
  const sdE = num(obs.sdE);
  const sdN = num(obs.sdN);
  if (sdE === null || sdN === null) return null;
  return Math.sqrt(sdE * sdE + sdN * sdN);
}

export function round(value, dp = 4) {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  const f = Math.pow(10, dp);
  return Math.round(value * f) / f;
}

/** Format a metre value for display, e.g. 96991.1127 -> "96991.1127". */
export function fmt(value, dp = 4) {
  if (value === null || value === undefined || value === "" || !Number.isFinite(Number(value)))
    return "-";
  return Number(value).toFixed(dp);
}

/**
 * Compute every derived value for a survey point.
 *
 * @param {Array} observations - [{ reference, dateTime, easting, northing, height, sdE, sdN, sdHgt }]
 * @param {Object} limits      - { positionLimit, heightLimit }
 * @returns {Object} computed   - means, spreads, per-observation deviations, flags
 */
export function computeSurveyPoint(observations = [], limits = {}, options = {}) {
  const positionLimit = num(limits.positionLimit) ?? DEFAULT_POSITION_LIMIT;
  const heightLimit = num(limits.heightLimit) ?? DEFAULT_HEIGHT_LIMIT;
  const minTimeDiffMinutes = num(limits.minTimeDiffMinutes) ?? DEFAULT_MIN_TIME_DIFF_PLOT_MINUTES;
  // Optional manual override of the coordinate quality (else auto-computed).
  const cqOverride = num(options.cqOverride);

  // Keep only observations with a valid horizontal position.
  const obs = (observations || [])
    .map((o) => ({
      reference: o.reference || "",
      dateTime: o.dateTime || null,
      easting: num(o.easting),
      northing: num(o.northing),
      height: num(o.height),
      sdE: num(o.sdE),
      sdN: num(o.sdN),
      sdHgt: num(o.sdHgt),
      // Optional manual overrides for the report's per-observation differences.
      posnDiffOverride: num(o.posnDiffOverride),
      hgtDiffOverride: num(o.hgtDiffOverride),
    }))
    .filter((o) => o.easting !== null && o.northing !== null);

  const n = obs.length;
  const base = {
    observationCount: n,
    meanEasting: null,
    meanNorthing: null,
    meanHeight: null,
    positionDiff: null, // max horizontal spread between observations
    heightDiff: null, // max vertical spread between observations
    timeDiffMinutes: null, // max gap between observation date/times
    cq: null, // coordinate quality (std error of the mean, horizontal)
    positionExceeded: false,
    heightExceeded: false,
    timeDiffExceeded: false,
    workingHoursExceeded: false, // any observation taken outside 06:00-18:00
    duplicateObservation: false, // two observations share identical E/N (likely a paste error)
    limitExceeded: false,
    isDoublePolar: n >= 2,
    perObservation: [],
    positionLimit,
    heightLimit,
    minTimeDiffMinutes,
  };

  if (n === 0) return base;

  // Mean coordinate (simple average of the independent observations).
  const meanEasting = obs.reduce((s, o) => s + o.easting, 0) / n;
  const meanNorthing = obs.reduce((s, o) => s + o.northing, 0) / n;

  const withHeight = obs.filter((o) => o.height !== null);
  const meanHeight =
    withHeight.length === n && n > 0
      ? withHeight.reduce((s, o) => s + o.height, 0) / n
      : null;

  // Max pairwise horizontal spread = the double-polar position difference.
  // Also detect an EXACT duplicate pair (identical Easting & Northing) — this is
  // never a genuine independent double-polar observation, it's almost always the
  // same data pasted twice for both polars (client: "second polar coordinates
  // are the same as first polar").
  let positionDiff = 0;
  let duplicateObservation = false;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const d = dist2D(obs[i], obs[j]);
      if (d > positionDiff) positionDiff = d;
      if (obs[i].easting === obs[j].easting && obs[i].northing === obs[j].northing) {
        duplicateObservation = true;
      }
    }
  }

  // Max pairwise vertical spread.
  let heightDiff = null;
  if (meanHeight !== null) {
    heightDiff = 0;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const d = Math.abs(obs[i].height - obs[j].height);
        if (d > heightDiff) heightDiff = d;
      }
    }
  }

  // Max pairwise gap between observation date/times (minutes) — double polar
  // requires the two visits to be genuinely independent, not back-to-back.
  const obsTimes = obs.map((o) => parseObsDateTime(o.dateTime)).filter(Boolean);
  const workingHoursExceeded = obsTimes.some((d) => isOutsideWorkingHours(d));
  let timeDiffMinutes = null;
  if (obsTimes.length >= 2) {
    let maxDiffMs = 0;
    for (let i = 0; i < obsTimes.length; i++) {
      for (let j = i + 1; j < obsTimes.length; j++) {
        const d = Math.abs(obsTimes[i] - obsTimes[j]);
        if (d > maxDiffMs) maxDiffMs = d;
      }
    }
    timeDiffMinutes = maxDiffMs / 60000;
  }

  // Per-observation deviation from the mean (for the report table).
  const mean = { easting: meanEasting, northing: meanNorthing };
  let sumSqDev = 0;
  const perObservation = obs.map((o) => {
    const autoPosn = dist2D(o, mean);
    sumSqDev += autoPosn * autoPosn; // CQ is always from the real geometry
    const autoHgt =
      meanHeight !== null && o.height !== null ? Math.abs(o.height - meanHeight) : null;
    // Apply manual overrides if present, else the auto-computed deviation.
    const finalPosn = o.posnDiffOverride !== null ? o.posnDiffOverride : autoPosn;
    const finalHgt = o.hgtDiffOverride !== null ? o.hgtDiffOverride : autoHgt;
    return {
      reference: o.reference,
      dateTime: o.dateTime,
      easting: o.easting,
      northing: o.northing,
      height: o.height,
      sdE: o.sdE,
      sdN: o.sdN,
      sdHgt: o.sdHgt,
      positionQuality: positionQuality(o),
      deviationPosn: round(finalPosn, 4),
      deviationHgt: finalHgt !== null ? round(finalHgt, 4) : null,
      // Combined Posn+Hgt difference, Euclidean (matches the Leica field book:
      // sqrt(posnDiff^2 + hgtDiff^2)). Equals posn deviation when no height.
      deviationCombined:
        finalHgt !== null
          ? round(Math.sqrt(finalPosn * finalPosn + finalHgt * finalHgt), 4)
          : round(finalPosn, 4),
    };
  });

  // Coordinate quality of the mean: standard error of the mean position
  // (RMS deviation / sqrt(n)) unless manually overridden. Transparent, not
  // Leica's proprietary CQ — see README.
  const cq = cqOverride !== null ? cqOverride : n > 1 ? Math.sqrt(sumSqDev / n) / Math.sqrt(n) : 0;

  const positionExceeded = positionDiff > positionLimit;
  const heightExceeded = heightDiff !== null && heightDiff > heightLimit;
  // Too SHORT a gap (not too long) is the problem here — the opposite sense
  // from position/height, where exceeding the limit means too much spread.
  const timeDiffExceeded = timeDiffMinutes !== null && timeDiffMinutes < minTimeDiffMinutes;

  return {
    ...base,
    meanEasting: round(meanEasting, 4),
    meanNorthing: round(meanNorthing, 4),
    meanHeight: meanHeight !== null ? round(meanHeight, 4) : null,
    positionDiff: round(positionDiff, 4),
    heightDiff: heightDiff !== null ? round(heightDiff, 4) : null,
    timeDiffMinutes: timeDiffMinutes !== null ? round(timeDiffMinutes, 2) : null,
    cq: round(cq, 4),
    positionExceeded,
    heightExceeded,
    timeDiffExceeded,
    workingHoursExceeded,
    duplicateObservation,
    limitExceeded:
      positionExceeded ||
      heightExceeded ||
      timeDiffExceeded ||
      workingHoursExceeded ||
      duplicateObservation,
    perObservation,
  };
}
