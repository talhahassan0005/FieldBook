import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import ControlPoint from "@/models/ControlPoint";
import SurveyPoint from "@/models/SurveyPoint";
import Job from "@/models/Job";

/**
 * Bulk import / upsert control (reference) points from pasted CSV data.
 * Body: { points: [{ name, code?, pointType?, easting, northing, height? }], overwrite?: boolean }
 * - If a control point name already exists in the job: replaces it when
 *   overwrite is true, otherwise skips it (reported back).
 * Mirrors the survey import so the importer can auto-split a mixed CSV.
 */
export async function POST(request, { params }) {
  try {
    const { id } = await params;
    await dbConnect();

    const job = await Job.findById(id).lean();
    if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

    const body = await request.json();
    const points = Array.isArray(body.points) ? body.points : [];
    const overwrite = !!body.overwrite;
    if (!points.length) {
      return NextResponse.json({ error: "No points to import" }, { status: 400 });
    }

    const existing = await ControlPoint.find({ job: id }).select("name").lean();
    const existingNames = new Set(existing.map((p) => p.name));

    let created = 0;
    let updated = 0;
    const skipped = [];

    for (const p of points) {
      if (!p.name || !String(p.name).trim()) continue;
      const name = String(p.name).trim();
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
        await ControlPoint.findOneAndUpdate({ job: id, name }, doc);
        updated++;
      } else {
        await ControlPoint.create({ job: id, name, ...doc });
        existingNames.add(name);
        created++;
      }
    }

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
