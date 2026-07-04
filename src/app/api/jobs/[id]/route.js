import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import Job from "@/models/Job";
import ControlPoint from "@/models/ControlPoint";
import SurveyPoint from "@/models/SurveyPoint";
import { computeSurveyPoint } from "@/lib/survey";
import { getAuthUser } from "@/lib/auth";

export async function GET(request, { params }) {
  try {
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    await dbConnect();
    const job = await Job.findById(id).lean();
    if (!job || String(job.owner) !== String(user.id)) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }
    return NextResponse.json(job);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PUT(request, { params }) {
  try {
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    await dbConnect();
    const body = await request.json();
    delete body.owner; // owner can never be reassigned via this endpoint

    // Capture old limits before the update so we can detect a tolerance change.
    const prev = await Job.findById(id).lean();
    if (!prev || String(prev.owner) !== String(user.id)) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    const job = await Job.findByIdAndUpdate(id, body, {
      new: true,
      runValidators: true,
    });
    if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

    // If any double-polar tolerance changed, recompute the cached `computed`
    // for every survey point so their pass/fail flags don't go stale.
    if (
      job.positionLimit !== prev.positionLimit ||
      job.heightLimit !== prev.heightLimit ||
      job.minTimeDiffMinutes !== prev.minTimeDiffMinutes
    ) {
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
                    {
                      positionLimit: job.positionLimit,
                      heightLimit: job.heightLimit,
                      minTimeDiffMinutes: job.minTimeDiffMinutes,
                    },
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
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    await dbConnect();
    const existing = await Job.findById(id).lean();
    if (!existing || String(existing.owner) !== String(user.id)) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }
    await Job.findByIdAndDelete(id);
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
