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
  const numericCols = new Set(["easting", "northing", "height", "sdE", "sdN", "sdHgt"]);

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
      if (numericCols.has(col)) rec[col] = toNum(raw);
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
