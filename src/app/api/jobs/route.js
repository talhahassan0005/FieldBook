import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import Job from "@/models/Job";
import { getAuthUser } from "@/lib/auth";
import { cleanupExpiredJobs } from "@/lib/cleanupExpiredJobs";

export async function GET(request) {
  try {
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    await dbConnect();
    // Client: jobs older than 12h (from their own "Job Created" time) must be
    // deleted automatically. No cron here, so sweep on every list load.
    await cleanupExpiredJobs(user.id);
    const jobs = await Job.find({ owner: user.id }).sort({ updatedAt: -1 }).lean();
    return NextResponse.json(jobs);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    await dbConnect();
    const body = await request.json();
    if (!body.name || !body.name.trim()) {
      return NextResponse.json({ error: "Job name is required" }, { status: 400 });
    }
    const job = await Job.create({ ...body, owner: user.id });
    return NextResponse.json(job, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
