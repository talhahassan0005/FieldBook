"use client";

import { useEffect, useState, use } from "react";
import Breadcrumbs from "@/components/Breadcrumbs";
import BackButton from "@/components/BackButton";
import JobForm from "@/components/JobForm";
import Spinner from "@/components/Spinner";
import { api } from "@/lib/api";

export default function EditJobPage({ params }) {
  const { id } = use(params);
  const [job, setJob] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .get(`/api/jobs/${id}`)
      .then(setJob)
      .catch((e) => setError(e.message));
  }, [id]);

  return (
    <div>
      <BackButton href={`/jobs/${id}`} label="Back to job" />
      <Breadcrumbs
        items={[
          { label: "Jobs", href: "/" },
          { label: job?.name || "Job", href: `/jobs/${id}` },
          { label: "Edit" },
        ]}
      />
      <h1 className="mb-6 text-2xl font-bold text-slate-900">Edit job</h1>
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {!job && !error ? <Spinner label="Loading job…" /> : job && <JobForm initial={job} jobId={id} />}
    </div>
  );
}
