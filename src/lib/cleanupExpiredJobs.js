import Job from "@/models/Job";
import ControlPoint from "@/models/ControlPoint";
import SurveyPoint from "@/models/SurveyPoint";
import { isJobExpired } from "@/lib/survey";

// Client: "job must be deleted automatically after 12 hrs of job created."
// There's no external cron/scheduler in this deployment, so cleanup runs
// opportunistically (lazy) whenever a user's jobs are listed or opened —
// scoped to one owner so it stays a cheap, targeted query rather than
// scanning the whole jobs collection on every request.
export async function cleanupExpiredJobs(ownerId) {
  const jobs = await Job.find({ owner: ownerId }).select("jobCreated createdAt").lean();
  const now = new Date();
  const expiredIds = jobs.filter((j) => isJobExpired(j, now)).map((j) => j._id);
  if (!expiredIds.length) return;
  // Cascade, same as the manual DELETE route: a job's control/survey points
  // must never outlive the job itself.
  await Promise.all([
    Job.deleteMany({ _id: { $in: expiredIds } }),
    ControlPoint.deleteMany({ job: { $in: expiredIds } }),
    SurveyPoint.deleteMany({ job: { $in: expiredIds } }),
  ]);
}
