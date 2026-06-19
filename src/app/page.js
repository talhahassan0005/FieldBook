"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import Spinner from "@/components/Spinner";
import { useToast } from "@/components/Toast";
import { useConfirm } from "@/components/ConfirmDialog";

export default function HomePage() {
  const toast = useToast();
  const confirm = useConfirm();
  const [jobs, setJobs] = useState(null);
  const [error, setError] = useState("");

  async function load() {
    try {
      setError("");
      const data = await api.get("/api/jobs");
      setJobs(data);
    } catch (err) {
      setError(err.message);
      setJobs([]);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function remove(id, name) {
    const okToDelete = await confirm({
      title: `Delete job "${name}"?`,
      message: "This permanently deletes the job and all its control points and survey points. This cannot be undone.",
      confirmText: "Delete job",
      danger: true,
    });
    if (!okToDelete) return;
    try {
      await api.del(`/api/jobs/${id}`);
      setJobs((prev) => prev.filter((j) => j._id !== id));
      toast.success(`Job "${name}" deleted.`);
    } catch (err) {
      toast.error(err.message);
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Survey Jobs</h1>
          <p className="text-sm text-slate-500">
            Each job holds its calibration control points and double-polar survey points.
          </p>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
          <div className="mt-1 text-xs text-red-500">
            Is MongoDB running and <code>MONGODB_URI</code> set in <code>.env.local</code>?
          </div>
        </div>
      )}

      {jobs === null ? (
        <Spinner label="Loading jobs…" />
      ) : jobs.length === 0 ? (
        <div className="card flex flex-col items-center justify-center gap-3 py-16 text-center">
          <p className="text-slate-500">No jobs yet.</p>
          <Link href="/jobs/new" className="btn-primary">
            + Create your first job
          </Link>
          <p className="text-xs text-slate-400">
            Or run <code className="rounded bg-slate-100 px-1">npm run seed</code> to load the sample
            MATEBELE2022 field book.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {jobs.map((job) => (
            <div key={job._id} className="card flex flex-col p-5">
              <Link href={`/jobs/${job._id}`} className="group flex-1">
                <h2 className="text-lg font-semibold text-slate-900 group-hover:text-brand-600">
                  {job.name}
                </h2>
                {job.description && (
                  <p className="mt-1 line-clamp-2 text-sm text-slate-500">{job.description}</p>
                )}
                <dl className="mt-3 space-y-1 text-xs text-slate-500">
                  {job.coordinateSystemName && (
                    <div className="flex justify-between">
                      <dt>Coord. system</dt>
                      <dd className="font-medium text-slate-700">{job.coordinateSystemName}</dd>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <dt>Posn / Hgt limit</dt>
                    <dd className="num font-medium text-slate-700">
                      {job.positionLimit} / {job.heightLimit} m
                    </dd>
                  </div>
                </dl>
              </Link>
              <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
                <Link href={`/jobs/${job._id}`} className="text-sm font-medium text-brand-600">
                  Open →
                </Link>
                <button
                  onClick={() => remove(job._id, job.name)}
                  className="text-xs text-slate-400 hover:text-red-600"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
