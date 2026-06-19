import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import SurveyPoint from "@/models/SurveyPoint";
import Job from "@/models/Job";
import { computeSurveyPoint } from "@/lib/survey";

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    await dbConnect();
    const points = await SurveyPoint.find({ job: id }).sort({ name: 1 }).lean();
    return NextResponse.json(points);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request, { params }) {
  try {
    const { id } = await params;
    await dbConnect();
    const job = await Job.findById(id).lean();
    if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

    const body = await request.json();
    if (!body.name || !body.name.trim()) {
      return NextResponse.json({ error: "Point name is required" }, { status: 400 });
    }

    const computed = computeSurveyPoint(
      body.observations || [],
      { positionLimit: job.positionLimit, heightLimit: job.heightLimit },
      { cqOverride: body.cqOverride }
    );

    const point = await SurveyPoint.create({
      job: id,
      name: body.name,
      code: body.code || "",
      cqOverride: body.cqOverride ?? null,
      observations: body.observations || [],
      computed,
    });
    return NextResponse.json(point, { status: 201 });
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
