/**
 * Clean placeholder / junk calibration data from existing jobs.
 *
 * Why this exists:
 *   The Calibration fields (2D-Helmert, Height transformation) are hidden in the
 *   Job form and only get filled from a SAVED coordinate system. Jobs created with
 *   a brand-new coordinate-system name — or with old test/lorem-ipsum data typed in
 *   before those fields were hidden — end up with:
 *     • junk text in heightTransformation.parameters / inclinationX / inclinationY
 *       (e.g. "Sunt tempora aute e"), and
 *     • null 2D-Helmert values (dE / dN / scale / rotation origin),
 *   which the Field Book report then prints as garbage or "-".
 *
 * What it does, per job:
 *   1. Resets junk/empty Height-transformation text to the  "no-height"
 *      defaults ("0.00000000  0.00000000  0.0000 m", "0° 00' 00.00000\"").
 *   2. Clears junk text out of transformation.rotation.
 *   3. Backfills null 2D-Helmert values from another job that shares the same
 *      coordinateSystemName and already has real calibration (so a job that lost
 *      its calibration is repaired from the canonical one — values are copied,
 *      never invented).
 *
 * Safe by default: prints a dry-run report and changes NOTHING. Re-run with
 * --apply to write the changes.
 *
 *   node scripts/clean-placeholder-data.mjs            (dry run — preview only)
 *   node scripts/clean-placeholder-data.mjs --apply    (write changes)
 *   npm run clean:placeholders -- --apply
 */

import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config(); // fall back to .env

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error("✗ MONGODB_URI is not set. Copy .env.example to .env.local first.");
  process.exit(1);
}

const APPLY = process.argv.includes("--apply");

//  "no-height calibration" defaults (match scripts/seed-matebele.mjs).
const HEIGHT_DEFAULTS = {
  parameters: "0.00000000  0.00000000  0.0000 m",
  inclinationX: "0° 00' 00.00000\"",
  inclinationY: "0° 00' 00.00000\"",
};

const jobSchema = new mongoose.Schema({}, { strict: false, timestamps: true });
const Job = mongoose.model("Job", jobSchema);

// A height "parameters" string is only digits / spaces / dots / minus / "m".
// Anything with other letters (lorem ipsum, a stray word) is junk text.
function isJunkParameters(s) {
  if (s == null || s === "") return false; // empty is handled separately
  return /[a-ln-z]/i.test(String(s)); // any letter except 'm' → not a parameters string
}

// A DMS angle ("0° 00' 00.00000\"" / "-179° 49' 43.18702\"") has no letters at all.
function isJunkAngle(s) {
  if (s == null || s === "") return false;
  return /[a-z]/i.test(String(s));
}

// Pick a clean value: keep the current one if it's a usable string, else default.
function cleanText({ current, isJunk, fallback }) {
  if (current == null || current === "" || isJunk(current)) return { value: fallback, changed: current !== fallback };
  return { value: current, changed: false };
}

async function run() {
  await mongoose.connect(MONGODB_URI);
  console.log(`✓ Connected to MongoDB${APPLY ? "" : "  (DRY RUN — no changes will be written)"}\n`);

  const jobs = await Job.find({}).lean();

  // Build a lookup of the best 2D-Helmert calibration per coordinate-system name,
  // so a job that lost its values can be repaired from a sibling that still has them.
  const calibBySystem = new Map();
  for (const j of jobs) {
    const t = j.transformation || {};
    const name = (j.coordinateSystemName || "").trim().toLowerCase();
    if (!name) continue;
    const hasReal = t.dE != null && t.dN != null;
    if (hasReal && !calibBySystem.has(name)) calibBySystem.set(name, t);
  }

  let touched = 0;

  for (const job of jobs) {
    const set = {};
    const notes = [];

    /* ---- Height transformation: reset junk / empty text to  defaults ---- */
    const hx = job.heightTransformation || {};
    const params = cleanText({ current: hx.parameters, isJunk: isJunkParameters, fallback: HEIGHT_DEFAULTS.parameters });
    const inclX = cleanText({ current: hx.inclinationX, isJunk: isJunkAngle, fallback: HEIGHT_DEFAULTS.inclinationX });
    const inclY = cleanText({ current: hx.inclinationY, isJunk: isJunkAngle, fallback: HEIGHT_DEFAULTS.inclinationY });
    if (params.changed) { set["heightTransformation.parameters"] = params.value; notes.push(`parameters: "${hx.parameters}" → "${params.value}"`); }
    if (inclX.changed) { set["heightTransformation.inclinationX"] = inclX.value; notes.push(`inclinationX: "${hx.inclinationX}" → "${inclX.value}"`); }
    if (inclY.changed) { set["heightTransformation.inclinationY"] = inclY.value; notes.push(`inclinationY: "${hx.inclinationY}" → "${inclY.value}"`); }
    if (hx.meanAccuracy == null) { set["heightTransformation.meanAccuracy"] = 0; notes.push("meanAccuracy: null → 0"); }
    if (hx.commonPoints == null) { set["heightTransformation.commonPoints"] = 0; notes.push("commonPoints: null → 0"); }

    /* ---- Transformation type / pre-transformation name: junk text ---- */
    // transformationType should be a real  type; lorem-ipsum like
    // "Duis et voluptatem" is junk → reset to the default "Twostep".
    const VALID_TYPES = new Set(["Twostep", "Onestep", "Classical", "Classical 3D"]);
    if (job.transformationType && !VALID_TYPES.has(String(job.transformationType).trim())) {
      set["transformationType"] = "Twostep";
      notes.push(`transformationType: "${job.transformationType}" → "Twostep" (junk)`);
    }
    // preTransformationName: a fake "Firstname Lastname" person name (faker test
    // data, e.g. "Knox Patrick") → clear it. A real one looks like a code with
    // underscores/digits ("DSM_BNGR_To_BTRS") and won't match this pattern.
    if (job.preTransformationName && /^[A-Z][a-z]+ [A-Z][a-z]+$/.test(String(job.preTransformationName).trim())) {
      set["preTransformationName"] = "";
      notes.push(`preTransformationName: "${job.preTransformationName}" → cleared (fake name)`);
    }

    /* ---- 2D-Helmert: clear junk rotation text, backfill null values ---- */
    const tx = job.transformation || {};
    if (isJunkAngle(tx.rotation)) { set["transformation.rotation"] = ""; notes.push(`rotation: "${tx.rotation}" → cleared (junk)`); }

    if (tx.dE == null && tx.dN == null) {
      const src = calibBySystem.get((job.coordinateSystemName || "").trim().toLowerCase());
      if (src) {
        for (const k of ["commonPoints", "rotationOriginX", "rotationOriginY", "dE", "dN", "rotation", "scalePpm"]) {
          if (src[k] != null && src[k] !== "" && tx[k] == null) set[`transformation.${k}`] = src[k];
        }
        if (Object.keys(set).some((k) => k.startsWith("transformation.") && k !== "transformation.rotation"))
          notes.push(`2D-Helmert backfilled from saved system "${job.coordinateSystemName}"`);
      }
    }

    if (notes.length === 0) continue;
    touched++;
    console.log(`• ${job.name || job._id}`);
    for (const n of notes) console.log(`    - ${n}`);

    if (APPLY) await Job.updateOne({ _id: job._id }, { $set: set });
  }

  console.log(
    `\n${touched === 0 ? "✓ Nothing to clean — all jobs look good." : `${APPLY ? "✅ Cleaned" : "Would clean"} ${touched} job(s).`}`
  );
  if (!APPLY && touched > 0) console.log("Re-run with --apply to write these changes.");

  await mongoose.disconnect();
  process.exit(0);
}

run().catch((err) => {
  console.error("❌ Clean error:", err.message);
  process.exit(1);
});
