import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import SurveyPoint from "@/models/SurveyPoint";
import ControlPoint from "@/models/ControlPoint";
import Job from "@/models/Job";
import { computeSurveyPoint } from "@/lib/survey";
import { getAuthUser } from "@/lib/auth";

/**
 * Bulk import / upsert survey points from pasted CSV data.
 * Body: { points: [{ name, code, observations: [...] }], overwrite?: boolean }
 * - If a point name already exists in the job: replaces its observations when
 *   overwrite is true, otherwise skips it (reported back).
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

    const limits = { positionLimit: job.positionLimit, heightLimit: job.heightLimit, minTimeDiffMinutes: job.minTimeDiffMinutes };
    const existing = await SurveyPoint.find({ job: id }).select("name sortOrder").lean();
    const existingNames = new Set(existing.map((p) => p.name));
    let nextSortOrder = existing.reduce((max, p) => Math.max(max, p.sortOrder ?? -1), -1) + 1;

    let created = 0;
    let updated = 0;
    const skipped = [];

    for (const p of points) {
      if (!p.name || !String(p.name).trim()) continue;
      const name = String(p.name).trim();
      const computed = computeSurveyPoint(p.observations || [], limits);

      if (existingNames.has(name)) {
        if (!overwrite) {
          skipped.push(name);
          continue;
        }
        await SurveyPoint.findOneAndUpdate(
          { job: id, name },
          { code: p.code || "", observations: p.observations || [], computed }
        );
        updated++;
      } else {
        await SurveyPoint.create({
          job: id,
          name,
          code: p.code || "",
          observations: p.observations || [],
          computed,
          // Preserves the order points appear in the CSV — NOT alphabetical
          // (so "1, 2, 3, ..., 10, 11" stays in that order, never "1, 10, 11, 2").
          sortOrder: nextSortOrder++,
        });
        existingNames.add(name);
        created++;
      }
    }

    // A point name belongs to either survey or control — not both. Remove any
    // control point that is now being (re)imported as a survey point, so the
    // point is never duplicated across the two collections.
    const names = points.map((p) => String(p.name || "").trim()).filter(Boolean);
    if (names.length) {
      await ControlPoint.deleteMany({ job: id, name: { $in: names } });
    }

    return NextResponse.json({ created, updated, skipped });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
