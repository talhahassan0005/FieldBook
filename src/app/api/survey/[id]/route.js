import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import SurveyPoint from "@/models/SurveyPoint";
import Job from "@/models/Job";
import { computeSurveyPoint } from "@/lib/survey";

export async function PUT(request, { params }) {
  try {
    const { id } = await params;
    await dbConnect();

    const existing = await SurveyPoint.findById(id);
    if (!existing)
      return NextResponse.json({ error: "Survey point not found" }, { status: 404 });

    const job = await Job.findById(existing.job).lean();
    const body = await request.json();

    if (body.name !== undefined) existing.name = body.name;
    if (body.code !== undefined) existing.code = body.code;
    if (body.cqOverride !== undefined) existing.cqOverride = body.cqOverride;
    if (body.observations !== undefined) existing.observations = body.observations;

    existing.computed = computeSurveyPoint(
      existing.observations,
      { positionLimit: job?.positionLimit, heightLimit: job?.heightLimit, minTimeDiffMinutes: job?.minTimeDiffMinutes },
      { cqOverride: existing.cqOverride }
    );

    await existing.save();
    return NextResponse.json(existing);
  } catch (err) {
    if (err.code === 11000) {
      return NextResponse.json(
        { error: "A survey point with that name already exists in this job" },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const { id } = await params;
    await dbConnect();
    const point = await SurveyPoint.findByIdAndDelete(id);
    if (!point) return NextResponse.json({ error: "Survey point not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
