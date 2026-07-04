import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import SurveyPoint from "@/models/SurveyPoint";
import Job from "@/models/Job";
import { computeSurveyPoint } from "@/lib/survey";
import { getAuthUser } from "@/lib/auth";

export async function GET(request, { params }) {
  try {
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    await dbConnect();
    const job = await Job.findById(id).select("owner").lean();
    if (!job || String(job.owner) !== String(user.id)) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }
    const points = await SurveyPoint.find({ job: id }).sort({ sortOrder: 1, _id: 1 }).lean();
    return NextResponse.json(points);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

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
    if (!body.name || !body.name.trim()) {
      return NextResponse.json({ error: "Point name is required" }, { status: 400 });
    }

    const computed = computeSurveyPoint(
      body.observations || [],
      { positionLimit: job.positionLimit, heightLimit: job.heightLimit, minTimeDiffMinutes: job.minTimeDiffMinutes },
      { cqOverride: body.cqOverride }
    );

    const last = await SurveyPoint.findOne({ job: id }).sort({ sortOrder: -1 }).select("sortOrder").lean();
    const nextSortOrder = (last?.sortOrder ?? -1) + 1;

    const point = await SurveyPoint.create({
      job: id,
      name: body.name,
      code: body.code || "",
      cqOverride: body.cqOverride ?? null,
      observations: body.observations || [],
      computed,
      sortOrder: nextSortOrder,
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
