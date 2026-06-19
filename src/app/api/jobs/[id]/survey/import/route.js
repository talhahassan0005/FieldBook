import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import SurveyPoint from "@/models/SurveyPoint";
import Job from "@/models/Job";
import { computeSurveyPoint } from "@/lib/survey";

/**
 * Bulk import / upsert survey points from pasted CSV data.
 * Body: { points: [{ name, code, observations: [...] }], overwrite?: boolean }
 * - If a point name already exists in the job: replaces its observations when
 *   overwrite is true, otherwise skips it (reported back).
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

    const limits = { positionLimit: job.positionLimit, heightLimit: job.heightLimit };
    const existing = await SurveyPoint.find({ job: id }).select("name").lean();
    const existingNames = new Set(existing.map((p) => p.name));

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
        });
        existingNames.add(name);
        created++;
      }
    }

    return NextResponse.json({ created, updated, skipped });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
