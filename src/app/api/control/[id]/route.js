import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import ControlPoint from "@/models/ControlPoint";
import Job from "@/models/Job";
import { getAuthUser } from "@/lib/auth";

export async function PUT(request, { params }) {
  try {
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    await dbConnect();
    const existing = await ControlPoint.findById(id).lean();
    if (!existing) return NextResponse.json({ error: "Control point not found" }, { status: 404 });
    const ownerJob = await Job.findById(existing.job).select("owner").lean();
    if (!ownerJob || String(ownerJob.owner) !== String(user.id)) {
      return NextResponse.json({ error: "Control point not found" }, { status: 404 });
    }

    const body = await request.json();
    delete body.job; // don't allow moving a point to another job
    const point = await ControlPoint.findByIdAndUpdate(id, body, {
      new: true,
      runValidators: true,
    });
    if (!point) return NextResponse.json({ error: "Control point not found" }, { status: 404 });
    return NextResponse.json(point);
  } catch (err) {
    if (err.code === 11000) {
      return NextResponse.json(
        { error: "A control point with that name already exists in this job" },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    await dbConnect();
    const existing = await ControlPoint.findById(id).lean();
    if (!existing) return NextResponse.json({ error: "Control point not found" }, { status: 404 });
    const ownerJob = await Job.findById(existing.job).select("owner").lean();
    if (!ownerJob || String(ownerJob.owner) !== String(user.id)) {
      return NextResponse.json({ error: "Control point not found" }, { status: 404 });
    }
    const point = await ControlPoint.findByIdAndDelete(id);
    if (!point) return NextResponse.json({ error: "Control point not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
