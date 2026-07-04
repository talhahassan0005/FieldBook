import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import Job from "@/models/Job";
import { getAuthUser } from "@/lib/auth";

/**
 * Reusable coordinate systems: the calibration / transformation is a property of
 * the coordinate system (TATI3D, MATEBELE2D…), entered once and reused by every
 * job that uses it. We derive the list from existing jobs — the most recent job
 * per coordinate-system name carries that system's calibration, which the New
 * Job form then auto-fills (so the surveyor never re-types it). No CSV contains
 * these values; they are the machine's calibration output, set once.
 */
export async function GET(request) {
  try {
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    await dbConnect();
    const jobs = await Job.find({ owner: user.id, coordinateSystemName: { $nin: ["", null] } })
      .sort({ updatedAt: -1 })
      .select(
        "coordinateSystemName coordinateSystemCreated transformationName transformationType heightMode preTransformationName residualsFormula ellipsoid projection geoidModel cscsModel transformation transformation3D heightTransformation"
      )
      .lean();

    // Keep the most recent (already sorted) entry per coordinate-system name.
    const byName = new Map();
    for (const j of jobs) {
      const key = j.coordinateSystemName.trim();
      if (key && !byName.has(key)) byName.set(key, j);
    }
    return NextResponse.json([...byName.values()]);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
