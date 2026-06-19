"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import Breadcrumbs from "@/components/Breadcrumbs";
import Spinner from "@/components/Spinner";
import StatusBadge from "@/components/StatusBadge";
import BackButton from "@/components/BackButton";
import { api } from "@/lib/api";
import { fmt } from "@/lib/survey";
import { useToast } from "@/components/Toast";
import { useConfirm } from "@/components/ConfirmDialog";

// Heavy, on-demand components — code-split so they load only when opened.
const SurveyPointForm = dynamic(() => import("@/components/SurveyPointForm"), {
  loading: () => <Spinner label="Loading form…" />,
});
const BulkImport = dynamic(() => import("@/components/BulkImport"), {
  loading: () => <Spinner label="Loading importer…" />,
});

export default function SurveyPointsPage({ params }) {
  const { id } = use(params);
  const toast = useToast();
  const confirm = useConfirm();
  const [job, setJob] = useState(null);
  const [control, setControl] = useState([]);
  const [points, setPoints] = useState(null);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [editing, setEditing] = useState(null);

  async function load() {
    try {
      const [j, c, s] = await Promise.all([
        api.get(`/api/jobs/${id}`),
        api.get(`/api/jobs/${id}/control`),
        api.get(`/api/jobs/${id}/survey`),
      ]);
      setJob(j);
      setControl(c);
      setPoints(s);
    } catch (e) {
      setError(e.message);
      setPoints([]);
    }
  }

  useEffect(() => {
    load();
  }, [id]);

  function openNew() {
    setEditing(null);
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function openEdit(p) {
    setEditing(p);
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  async function onSaved() {
    setShowForm(false);
    setEditing(null);
    await load();
  }
  async function remove(p) {
    const okToDelete = await confirm({
      title: `Delete survey point "${p.name}"?`,
      message: "This point and its observations will be removed.",
      confirmText: "Delete",
      danger: true,
    });
    if (!okToDelete) return;
    try {
      await api.del(`/api/survey/${p._id}`);
      toast.success(`Survey point "${p.name}" deleted.`);
      await load();
    } catch (err) {
      toast.error(err.message);
    }
  }

  const limits = job ? { positionLimit: job.positionLimit, heightLimit: job.heightLimit } : {};
  const includeHeight = !!job?.includeHeight;

  return (
    <div>
      <BackButton href={`/jobs/${id}`} label="Back to job" />
      <Breadcrumbs
        items={[
          { label: "Jobs", href: "/" },
          { label: job?.name || "Job", href: `/jobs/${id}` },
          { label: "Survey points" },
        ]}
      />
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Survey points</h1>
          <p className="text-sm text-slate-500">
            Double-polar observations — each point measured from two reference stations.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href={`/jobs/${id}/report`} className="btn-secondary">
            📄 Report
          </Link>
          {!showImport && (
            <button
              className="btn-secondary"
              onClick={() => {
                setShowImport(true);
                setShowForm(false);
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
            >
              📥 Import CSV / paste
            </button>
          )}
          {!showForm && (
            <button className="btn-primary" onClick={openNew}>
              + Add survey point
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {showImport && (
        <div className="mb-6">
          <BulkImport
            jobId={id}
            limits={limits}
            includeHeight={includeHeight}
            onImported={load}
            onCancel={() => setShowImport(false)}
          />
        </div>
      )}

      {showForm && (
        <div className="mb-6">
          {control.length === 0 && (
            <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-700">
              Tip: add{" "}
              <Link href={`/jobs/${id}/control`} className="font-medium underline">
                control points
              </Link>{" "}
              first so you can pick references from a list (you can still type them manually).
            </div>
          )}
          <SurveyPointForm
            key={editing?._id ?? "new"}
            jobId={id}
            controlPoints={control}
            limits={limits}
            includeHeight={includeHeight}
            initial={editing}
            onSaved={onSaved}
            onCancel={() => {
              setShowForm(false);
              setEditing(null);
            }}
          />
        </div>
      )}

      {points === null ? (
        <Spinner label="Loading survey points…" />
      ) : points.length === 0 ? (
        <div className="card py-12 text-center text-sm text-slate-500">
          No survey points yet.
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs uppercase text-slate-400">
                <th className="px-5 py-2 font-semibold">Point</th>
                <th className="px-3 py-2 text-center font-semibold">Obs</th>
                <th className="px-3 py-2 text-right font-semibold">Mean E</th>
                <th className="px-3 py-2 text-right font-semibold">Mean N</th>
                {includeHeight && <th className="px-3 py-2 text-right font-semibold">Mean Hgt</th>}
                <th className="px-3 py-2 text-right font-semibold">Posn diff</th>
                {includeHeight && <th className="px-3 py-2 text-right font-semibold">Hgt diff</th>}
                <th className="px-3 py-2 font-semibold">Status</th>
                <th className="px-5 py-2 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {points.map((p) => (
                <tr key={p._id} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="px-5 py-2 font-medium text-slate-800">
                    {p.name}
                    {p.code && <span className="ml-2 text-xs text-slate-400">{p.code}</span>}
                  </td>
                  <td className="px-3 py-2 text-center text-slate-600">{p.computed?.observationCount ?? 0}</td>
                  <td className="num px-3 py-2 text-right text-slate-600">{fmt(p.computed?.meanEasting)}</td>
                  <td className="num px-3 py-2 text-right text-slate-600">{fmt(p.computed?.meanNorthing)}</td>
                  {includeHeight && (
                    <td className="num px-3 py-2 text-right text-slate-600">{fmt(p.computed?.meanHeight)}</td>
                  )}
                  <td className={`num px-3 py-2 text-right ${p.computed?.positionExceeded ? "font-semibold text-red-600" : "text-slate-600"}`}>
                    {fmt(p.computed?.positionDiff)}
                  </td>
                  {includeHeight && (
                    <td className={`num px-3 py-2 text-right ${p.computed?.heightExceeded ? "font-semibold text-red-600" : "text-slate-600"}`}>
                      {fmt(p.computed?.heightDiff)}
                    </td>
                  )}
                  <td className="px-3 py-2">
                    <StatusBadge computed={p.computed} />
                  </td>
                  <td className="px-5 py-2 text-right">
                    <button onClick={() => openEdit(p)} className="text-xs font-medium text-brand-600 hover:underline">
                      Edit
                    </button>
                    <button onClick={() => remove(p)} className="ml-3 text-xs text-slate-400 hover:text-red-600">
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
