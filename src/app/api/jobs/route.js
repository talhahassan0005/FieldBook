import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import Job from "@/models/Job";

export async function GET() {
  try {
    await dbConnect();
    const jobs = await Job.find().sort({ updatedAt: -1 }).lean();
    return NextResponse.json(jobs);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    await dbConnect();
    const body = await request.json();
    if (!body.name || !body.name.trim()) {
      return NextResponse.json({ error: "Job name is required" }, { status: 400 });
    }
    const job = await Job.create(body);
    return NextResponse.json(job, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
