"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Breadcrumbs from "@/components/Breadcrumbs";
import BackButton from "@/components/BackButton";
import Spinner from "@/components/Spinner";
import StatusBadge from "@/components/StatusBadge";
import { api } from "@/lib/api";
import { fmt } from "@/lib/survey";
import { useToast } from "@/components/Toast";
import { useConfirm } from "@/components/ConfirmDialog";

export default function JobOverviewPage({ params }) {
  const { id } = use(params);
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [job, setJob] = useState(null);
  const [control, setControl] = useState([]);
  const [survey, setSurvey] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [j, c, s] = await Promise.all([
          api.get(`/api/jobs/${id}`),
          api.get(`/api/jobs/${id}/control`),
          api.get(`/api/jobs/${id}/survey`),
        ]);
        if (!active) return;
        setJob(j);
        setControl(c);
        setSurvey(s);
      } catch (e) {
        if (active) setError(e.message);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [id]);

  async function removeJob() {
    const okToDelete = await confirm({
      title: `Delete job "${job.name}"?`,
      message:
        "This permanently deletes the job and all its control points and survey points. This cannot be undone.",
      confirmText: "Delete job",
      danger: true,
    });
    if (!okToDelete) return;
    setDeleting(true);
    try {
      await api.del(`/api/jobs/${id}`);
      toast.success(`Job "${job.name}" deleted.`);
      router.push("/");
      router.refresh();
    } catch (err) {
      toast.error(err.message);
      setDeleting(false);
    }
  }

  if (loading) return <Spinner label="Loading job…" />;
  if (error)
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        {error}
      </div>
    );
  if (!job) return null;

  const exceeded = survey.filter((p) => p.computed?.limitExceeded).length;
  const ok = survey.filter((p) => p.computed?.isDoublePolar && !p.computed?.limitExceeded).length;
  const single = survey.filter((p) => p.computed?.observationCount === 1).length;

  return (
    <div>
      <BackButton href="/" label="Back to jobs" />
      <Breadcrumbs items={[{ label: "Jobs", href: "/" }, { label: job.name }]} />

      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{job.name}</h1>
          <p className="text-sm text-slate-500">
            {job.description || "Cadastral survey job"} {job.creator && `· ${job.creator}`}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href={`/jobs/${id}/report`} className="btn-secondary">
            📄 Field Book Report
          </Link>
          <Link href={`/jobs/${id}/coordinates`} className="btn-secondary">
            📋 Coordinate List
          </Link>
          <Link href={`/jobs/${id}/edit`} className="btn-ghost">
            Edit job
          </Link>
          <button onClick={removeJob} disabled={deleting} className="btn-ghost text-red-600 hover:bg-red-50">
            {deleting ? "Deleting…" : "🗑 Delete"}
          </button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Control points" value={control.length} href={`/jobs/${id}/control`} />
        <Stat label="Survey points" value={survey.length} href={`/jobs/${id}/survey`} />
        <Stat label="Within tolerance" value={ok} tone="emerald" />
        <Stat label="Single obs." value={single} tone={single ? "amber" : "slate"} />
        <Stat label="Limit exceeded" value={exceeded} tone={exceeded ? "red" : "slate"} />
      </div>

      {single > 0 && (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-700">
          {single} point{single > 1 ? "s have" : " has"} only a single observation — add the second
          reference to complete the double-polar check.
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Calibration / coordinate system */}
        <section className="card p-5 lg:col-span-1">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">
            Calibration
          </h2>
          <dl className="space-y-2 text-sm">
            <Row label="Coordinate system" value={job.coordinateSystemName} />
            <Row label="Transformation" value={job.transformationType} />
            <Row label="Ellipsoid" value={job.ellipsoid} />
            <Row label="Projection" value={job.projection} />
            <Row label="Height mode" value={job.heightMode} />
            <Row label="Posn limit" value={`${job.positionLimit} m`} mono />
            {job.includeHeight && <Row label="Hgt limit" value={`${job.heightLimit} m`} mono />}
            <Row label="Height" value={job.includeHeight ? "Included" : "Not used"} />
            <Row label="Survey type" value={job.surveyType === "farm" ? "Farm" : "Plot"} />
            <Row label="Min. time diff" value={`${job.minTimeDiffMinutes} min`} mono />
          </dl>
          <Link href={`/jobs/${id}/control`} className="mt-4 inline-block text-sm font-medium text-brand-600">
            Manage control points →
          </Link>
        </section>

        {/* Survey points summary */}
        <section className="card lg:col-span-2">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">
              Survey points
            </h2>
            <Link href={`/jobs/${id}/survey`} className="btn-primary !py-1.5 !text-xs">
              + Add / manage
            </Link>
          </div>
          {survey.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-slate-500">
              No survey points yet.{" "}
              <Link href={`/jobs/${id}/survey`} className="font-medium text-brand-600">
                Add the first one
              </Link>
              .
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-xs uppercase text-slate-400">
                    <th className="px-5 py-2 font-semibold">Point</th>
                    <th className="px-3 py-2 text-right font-semibold">Mean E</th>
                    <th className="px-3 py-2 text-right font-semibold">Mean N</th>
                    <th className="px-3 py-2 text-right font-semibold">Posn diff</th>
                    <th className="px-5 py-2 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {survey.map((p) => (
                    <tr key={p._id} className="border-b border-slate-50 hover:bg-slate-50">
                      <td className="px-5 py-2 font-medium text-slate-800">{p.name}</td>
                      <td className="num px-3 py-2 text-right text-slate-600">{fmt(p.computed?.meanEasting)}</td>
                      <td className="num px-3 py-2 text-right text-slate-600">{fmt(p.computed?.meanNorthing)}</td>
                      <td className="num px-3 py-2 text-right text-slate-600">{fmt(p.computed?.positionDiff)}</td>
                      <td className="px-5 py-2">
                        <StatusBadge computed={p.computed} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function Stat({ label, value, href, tone = "slate" }) {
  const tones = {
    slate: "text-slate-900",
    emerald: "text-emerald-600",
    amber: "text-amber-600",
    red: "text-red-600",
  };
  const inner = (
    <div className="card p-5">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</div>
      <div className={`mt-1 text-3xl font-bold ${tones[tone]}`}>{value}</div>
    </div>
  );
  return href ? (
    <Link href={href} className="block transition hover:-translate-y-0.5">
      {inner}
    </Link>
  ) : (
    inner
  );
}

function Row({ label, value, mono }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-slate-500">{label}</dt>
      <dd className={`text-right font-medium text-slate-800 ${mono ? "num" : ""}`}>
        {value || "-"}
      </dd>
    </div>
  );
}
