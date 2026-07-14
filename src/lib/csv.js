/**
 * Parse pasted survey data (CSV / TSV / whitespace) into records.
 *
 * This powers the "paste from machine CSV" import — the surveyor copies the
 * point rows for the first polar (machine on base A) and the second polar
 * (machine on base B), and the app pairs them by point name and computes the
 * double-polar result. Eliminates manual re-typing (and typos like 7333 vs 7033).
 *
 * Pure & isomorphic.
 */

/** Detect the most likely delimiter on a sample line. */
function detectDelimiter(line) {
  if (line.includes("\t")) return "\t";
  if (line.includes(",")) return ",";
  if (line.includes(";")) return ";";
  return /\s+/; // fall back to any whitespace run
}

function splitLine(line, delim) {
  if (delim instanceof RegExp) return line.trim().split(delim);
  return line.split(delim).map((c) => c.trim());
}

function toNum(v) {
  if (v === "" || v === null || v === undefined) return null;
  const n = parseFloat(String(v).replace(/[^0-9eE.+-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** Count digits after the decimal point in a raw numeric string (0 if none/no decimal). */
function decimalDigits(raw) {
  const s = String(raw ?? "").trim();
  const m = s.match(/\.(\d+)/);
  return m ? m[1].length : 0;
}

/**
 * Client rule (2026-07): a CSV coordinate with EXACTLY 3 decimal places gets
 * an artificial 4th digit derived from the average of its existing 3 decimal
 * digits (floored), instead of a bare trailing zero — which was producing
 * suspicious ".XXX0" mean-coordinate averages in the report. e.g.
 * "2784620.296" -> digits 2,9,6 -> avg (2+9+6)/3 = 5.666 -> floor 5 ->
 * 2784620.2965. Values with any OTHER decimal-digit count (already 4+, or
 * fewer than 3) are parsed normally — the rule is specifically for 3-decimal
 * source data.
 */
function deriveFourthDecimal(raw) {
  const s = String(raw ?? "").trim();
  if (decimalDigits(s) !== 3) return toNum(s);
  const m = s.match(/^(-?\d+)\.(\d{3})$/);
  if (!m) return toNum(s);
  const [, intPart, decPart] = m;
  const digits = decPart.split("").map(Number);
  const avgDigit = Math.floor((digits[0] + digits[1] + digits[2]) / 3);
  return parseFloat(`${intPart}.${decPart}${avgDigit}`);
}

/**
 * @param {string} text       - pasted block
 * @param {string[]} columns  - column spec, e.g. ["name","easting","northing","height","sdE","sdN","sdHgt","code"]
 * @returns {{rows: Array, errors: string[]}}
 *   rows: [{ name, code, easting, northing, height, sdE, sdN, sdHgt }]
 */
export function parsePastedRows(text, columns) {
  const errors = [];
  const rows = [];
  if (!text || !text.trim()) return { rows, errors };

  const lines = text
    .split(/\r?\n/)
    .map((l) => l)
    .filter((l) => l.trim() !== "");

  const delim = detectDelimiter(lines[0]);
  const numericCols = new Set([
    "easting", "northing", "height",
    "sdE", "sdN", "sdHgt",
    // Calibration columns for control / identical points.
    "wgs84X", "wgs84Y", "wgs84Z", "resE", "resN", "resHgt",
  ]);
  // Coordinate columns get the 3-decimal -> derived-4th-digit treatment
  // (client rule above); other numeric columns (Sd/quality, calibration) are
  // left as plain numbers.
  const fourDecimalCols = new Set(["easting", "northing", "height"]);

  lines.forEach((line, idx) => {
    const cells = splitLine(line, delim);
    // Skip an obvious header row: the first line whose EVERY numeric column is
    // non-numeric (a real header has text in all coordinate columns). A data row
    // with one bad value still falls through and is reported as an error.
    if (idx === 0) {
      const numCols = columns.filter((c) => numericCols.has(c));
      const allNonNumeric =
        numCols.length > 0 &&
        numCols.every((col) => {
          const ci = columns.indexOf(col);
          return cells[ci] === undefined || toNum(cells[ci]) === null;
        });
      if (allNonNumeric) return; // header line
    }

    const rec = {};
    columns.forEach((col, c) => {
      const raw = cells[c];
      if (col === "ignore" || col === undefined) return;
      if (fourDecimalCols.has(col)) rec[col] = deriveFourthDecimal(raw);
      else if (numericCols.has(col)) rec[col] = toNum(raw);
      else rec[col] = raw !== undefined ? String(raw).trim() : "";
    });

    if (!rec.name) {
      errors.push(`Line ${idx + 1}: missing point name — skipped`);
      return;
    }
    if (rec.easting === null || rec.northing === null) {
      errors.push(`Line ${idx + 1} (${rec.name}): missing/invalid Easting or Northing — skipped`);
      return;
    }

    rows.push(rec);
  });

  return { rows, errors };
}

// Reference / control marks are recognised either by their point name
// (WP1, BRM19, MTRM4, …) or by a feature code that denotes a beacon / benchmark
// (IPC12, …). Everything else is treated as a measured survey point.
export const CONTROL_NAME_RE = /^(wp|brm|mtrm|trm|stn|bm|tbm)\s*\d/i;
export const CONTROL_CODE_RE = /(ipc|brm|trm|beacon|benchmark|control|trig|tbm)/i;

/**
 * Decide whether a parsed CSV row is a control/reference point or a survey point.
 * Used by the importer to auto-split a mixed coordinate list (the client's CSV
 * lists both the working point + reference marks AND the plot corners together).
 *
 * @returns {"control" | "survey"}
 */
export function classifyPointKind(
  row,
  { nameRe = CONTROL_NAME_RE, codeRe = CONTROL_CODE_RE } = {}
) {
  const name = String(row?.name || "").trim();
  const code = String(row?.code || "").trim();
  if (name && nameRe.test(name)) return "control";
  if (code && codeRe.test(code)) return "control";
  return "survey";
}

/**
 * Pair first-polar and second-polar rows by point name into survey-point inputs.
 *
 * @returns Array<{ name, code, observations: [...] }>
 */
export function pairPolars(firstRows, secondRows, firstRef, secondRef) {
  const byName = new Map();

  const add = (rows, reference) => {
    for (const r of rows) {
      if (!byName.has(r.name)) byName.set(r.name, { name: r.name, code: r.code || "", observations: [] });
      const entry = byName.get(r.name);
      if (!entry.code && r.code) entry.code = r.code;
      entry.observations.push({
        reference: reference || "",
        dateTime: "",
        easting: r.easting,
        northing: r.northing,
        height: r.height ?? null,
        sdE: r.sdE ?? null,
        sdN: r.sdN ?? null,
        sdHgt: r.sdHgt ?? null,
      });
    }
  };

  add(firstRows, firstRef);
  add(secondRows, secondRef);

  return Array.from(byName.values());
}
