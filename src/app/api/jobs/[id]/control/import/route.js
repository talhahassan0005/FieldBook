import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import ControlPoint from "@/models/ControlPoint";
import SurveyPoint from "@/models/SurveyPoint";
import Job from "@/models/Job";
import { getAuthUser } from "@/lib/auth";

/**
 * Bulk import / upsert control (reference) points from pasted CSV data.
 * Body: { points: [{ name, code?, pointType?, easting, northing, height? }], overwrite?: boolean }
 * - If a control point name already exists in the job: replaces it when
 *   overwrite is true, otherwise skips it (reported back).
 * Mirrors the survey import so the importer can auto-split a mixed CSV.
 */
export async function POST(request, { params }) {
  try {
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    await dbConnect();

    const job = await Job.findById(id).lean();
    if (!job || String(job.owner) !== String(user.id)) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    const body = await request.json();
    const points = Array.isArray(body.points) ? body.points : [];
    const overwrite = !!body.overwrite;
    if (!points.length) {
      return NextResponse.json({ error: "No points to import" }, { status: 400 });
    }

    const existing = await ControlPoint.find({ job: id }).select("name sortOrder").lean();
    const existingNames = new Set(existing.map((p) => p.name));
    let nextSortOrder = existing.reduce((max, p) => Math.max(max, p.sortOrder ?? -1), -1) + 1;

    let created = 0;
    let updated = 0;
    const skipped = [];

    // Flush in ONE bulk round-trip each (insertMany / bulkWrite) instead of an
    // await per point — hundreds of sequential round-trips to Atlas were what
    // made large imports look like a database timeout.
    const toInsert = [];
    const updateOps = [];
    const seen = new Set();

    for (const p of points) {
      if (!p.name || !String(p.name).trim()) continue;
      const name = String(p.name).trim();
      if (seen.has(name)) continue;
      seen.add(name);
      const doc = {
        code: p.code || "",
        pointType: p.pointType || "Position",
        easting: p.easting ?? null,
        northing: p.northing ?? null,
        height: p.height ?? null,
        // Calibration data (populates Residuals + List of identical points).
        wgs84X: p.wgs84X ?? null,
        wgs84Y: p.wgs84Y ?? null,
        wgs84Z: p.wgs84Z ?? null,
        resE: p.resE ?? null,
        resN: p.resN ?? null,
        resHgt: p.resHgt ?? null,
      };

      if (existingNames.has(name)) {
        if (!overwrite) {
          skipped.push(name);
          continue;
        }
        updateOps.push({ updateOne: { filter: { job: id, name }, update: { $set: doc } } });
        updated++;
      } else {
        // Preserves the order points appear in the CSV — NOT alphabetical
        // (so "1, 2, 3, ..., 10, 11" stays in that order, never "1, 10, 11, 2").
        toInsert.push({ job: id, name, ...doc, sortOrder: nextSortOrder++ });
        created++;
      }
    }

    if (toInsert.length) await ControlPoint.insertMany(toInsert, { ordered: false });
    if (updateOps.length) await ControlPoint.bulkWrite(updateOps, { ordered: false });

    // A point name belongs to either control or survey — not both. Remove any
    // survey point that is now being (re)imported as a control point (e.g. the
    // reference marks that were previously imported as survey points).
    const names = points.map((p) => String(p.name || "").trim()).filter(Boolean);
    if (names.length) {
      await SurveyPoint.deleteMany({ job: id, name: { $in: names } });
    }

    return NextResponse.json({ created, updated, skipped });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
