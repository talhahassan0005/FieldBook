import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import Job from "@/models/Job";
import ControlPoint from "@/models/ControlPoint";
import SurveyPoint from "@/models/SurveyPoint";
import { computeSurveyPoint } from "@/lib/survey";

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    await dbConnect();
    const job = await Job.findById(id).lean();
    if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
    return NextResponse.json(job);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PUT(request, { params }) {
  try {
    const { id } = await params;
    await dbConnect();
    const body = await request.json();

    // Capture old limits before the update so we can detect a tolerance change.
    const prev = await Job.findById(id).lean();
    if (!prev) return NextResponse.json({ error: "Job not found" }, { status: 404 });

    const job = await Job.findByIdAndUpdate(id, body, {
      new: true,
      runValidators: true,
    });
    if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

    // If either double-polar tolerance changed, recompute the cached `computed`
    // for every survey point so their pass/fail flags don't go stale.
    if (job.positionLimit !== prev.positionLimit || job.heightLimit !== prev.heightLimit) {
      const points = await SurveyPoint.find({ job: id })
        .select("observations cqOverride")
        .lean();
      if (points.length) {
        await SurveyPoint.bulkWrite(
          points.map((p) => ({
            updateOne: {
              filter: { _id: p._id },
              update: {
                $set: {
                  computed: computeSurveyPoint(
                    p.observations || [],
                    { positionLimit: job.positionLimit, heightLimit: job.heightLimit },
                    { cqOverride: p.cqOverride }
                  ),
                },
              },
            },
          }))
        );
      }
    }

    return NextResponse.json(job);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const { id } = await params;
    await dbConnect();
    const job = await Job.findByIdAndDelete(id);
    if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
    // Cascade: remove this job's control points and survey points.
    await Promise.all([
      ControlPoint.deleteMany({ job: id }),
      SurveyPoint.deleteMany({ job: id }),
    ]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
