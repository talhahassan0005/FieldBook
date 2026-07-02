"use client";

import { useEffect, useState, use, useId, isValidElement, cloneElement } from "react";
import Breadcrumbs from "@/components/Breadcrumbs";
import BackButton from "@/components/BackButton";
import Spinner from "@/components/Spinner";
import { api } from "@/lib/api";
import { fmt } from "@/lib/survey";
import { useToast } from "@/components/Toast";
import { useConfirm } from "@/components/ConfirmDialog";

const EMPTY = {
  name: "",
  pointType: "Position",
  easting: "",
  northing: "",
  height: "",
  wgs84X: "",
  wgs84Y: "",
  wgs84Z: "",
  resE: "",
  resN: "",
  resHgt: "",
  note: "",
};

export default function ControlPointsPage({ params }) {
  const { id } = use(params);
  const toast = useToast();
  const confirm = useConfirm();
  const [job, setJob] = useState(null);
  const [points, setPoints] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    try {
      const [j, c] = await Promise.all([
        api.get(`/api/jobs/${id}`),
        api.get(`/api/jobs/${id}/control`),
      ]);
      setJob(j);
      setPoints(c);
    } catch (e) {
      setError(e.message);
      setPoints([]);
    }
  }

  // Follows the job's "Coordinates decimal places" setting (same one used on
  // the printed field book report) so WP1 / MTRM4 etc. show consistent precision.
  const coordDp = job?.coordDecimals === 3 ? 3 : 4;

  useEffect(() => {
    load();
  }, [id]);

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function startEdit(p) {
    setEditingId(p._id);
    setForm({
      name: p.name ?? "",
      pointType: p.pointType ?? "Position",
      easting: p.easting ?? "",
      northing: p.northing ?? "",
      height: p.height ?? "",
      wgs84X: p.wgs84X ?? "",
      wgs84Y: p.wgs84Y ?? "",
      wgs84Z: p.wgs84Z ?? "",
      resE: p.resE ?? "",
      resN: p.resN ?? "",
      resHgt: p.resHgt ?? "",
      note: p.note ?? "",
    });
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function reset() {
    setEditingId(null);
    setForm(EMPTY);
    setError("");
  }

  async function submit(e) {
    e.preventDefault();
    if (!form.name.trim()) {
      setError("Point name is required");
      return;
    }
    setSaving(true);
    setError("");
    const payload = {
      name: form.name.trim(),
      pointType: form.pointType || "Position",
      easting: num(form.easting),
      northing: num(form.northing),
      height: num(form.height),
      wgs84X: num(form.wgs84X),
      wgs84Y: num(form.wgs84Y),
      wgs84Z: num(form.wgs84Z),
      resE: num(form.resE),
      resN: num(form.resN),
      resHgt: num(form.resHgt),
      note: form.note,
    };
    try {
      if (editingId) {
        await api.put(`/api/control/${editingId}`, payload);
        toast.success(`Control point "${payload.name}" updated.`);
      } else {
        await api.post(`/api/jobs/${id}/control`, payload);
        toast.success(`Control point "${payload.name}" added.`);
      }
      reset();
      await load();
    } catch (err) {
      setError(err.message);
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function remove(p) {
    const okToDelete = await confirm({
      title: `Delete control point "${p.name}"?`,
      message: "This reference point will be removed from the job.",
      confirmText: "Delete",
      danger: true,
    });
    if (!okToDelete) return;
    try {
      await api.del(`/api/control/${p._id}`);
      toast.success(`Control point "${p.name}" deleted.`);
      await load();
    } catch (err) {
      toast.error(err.message);
    }
  }

  return (
    <div>
      <BackButton href={`/jobs/${id}`} label="Back to job" />
      <Breadcrumbs
        items={[
          { label: "Jobs", href: "/" },
          { label: job?.name || "Job", href: `/jobs/${id}` },
          { label: "Control points" },
        ]}
      />
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Control points</h1>
        <p className="text-sm text-slate-500">
          Known reference stations (e.g. MTRM4, WP1) used as baselines for double-polar observations.
        </p>
      </div>

      <form onSubmit={submit} className="card mb-6 p-5">
        <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-slate-500">
          {editingId ? "Edit control point" : "Add control point"}
        </h2>
        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
            {error}
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-4">
          <F label="Name *">
            <input className="input" required aria-required="true" value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="MTRM4" />
          </F>
          <F label="Easting (m)">
            <input className="input num" value={form.easting} onChange={(e) => set("easting", e.target.value)} placeholder="97672.8530" />
          </F>
          <F label="Northing (m)">
            <input className="input num" value={form.northing} onChange={(e) => set("northing", e.target.value)} placeholder="2715614.3960" />
          </F>
          <F label="Height (m)">
            <input className="input num" value={form.height} onChange={(e) => set("height", e.target.value)} placeholder="optional" />
          </F>
        </div>
        <details className="mt-4">
          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-slate-400">
            Calibration details — WGS-84 Cartesian &amp; residuals (optional)
          </summary>
          <div className="mt-3 grid gap-4 sm:grid-cols-4">
            <F label="Point type">
              <input className="input" list="pointtype-options" value={form.pointType} onChange={(e) => set("pointType", e.target.value)} placeholder="Position" />
              <datalist id="pointtype-options">
                <option value="Reference Mark" />
                <option value="Working Point" />
                <option value="Position" />
              </datalist>
              <p className="mt-1 text-[11px] text-slate-400">
                Use exactly <span className="font-semibold">Reference Mark</span> or{" "}
                <span className="font-semibold">Working Point</span> for calibration stations (e.g. WP1) —
                the Coordinate List and Field Book Report group/label points by this value.
              </p>
            </F>
            <F label="WGS-84 X (m)">
              <input className="input num" value={form.wgs84X} onChange={(e) => set("wgs84X", e.target.value)} />
            </F>
            <F label="WGS-84 Y (m)">
              <input className="input num" value={form.wgs84Y} onChange={(e) => set("wgs84Y", e.target.value)} />
            </F>
            <F label="WGS-84 Z (m)">
              <input className="input num" value={form.wgs84Z} onChange={(e) => set("wgs84Z", e.target.value)} />
            </F>
            <F label="Residual dE (m)">
              <input className="input num" value={form.resE} onChange={(e) => set("resE", e.target.value)} placeholder="optional" />
            </F>
            <F label="Residual dN (m)">
              <input className="input num" value={form.resN} onChange={(e) => set("resN", e.target.value)} placeholder="optional" />
            </F>
            <F label="Residual dHgt (m)">
              <input className="input num" value={form.resHgt} onChange={(e) => set("resHgt", e.target.value)} placeholder="optional" />
            </F>
            <F label="Note">
              <input className="input" value={form.note} onChange={(e) => set("note", e.target.value)} />
            </F>
          </div>
        </details>
        <div className="mt-4 flex gap-2">
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? "Saving…" : editingId ? "Save changes" : "Add point"}
          </button>
          {editingId && (
            <button type="button" className="btn-secondary" onClick={reset}>
              Cancel edit
            </button>
          )}
        </div>
      </form>

      {points === null ? (
        <Spinner label="Loading control points…" />
      ) : points.length === 0 ? (
        <div className="card py-12 text-center text-sm text-slate-500">No control points yet.</div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs uppercase text-slate-400">
                <th className="px-5 py-2 font-semibold">Name</th>
                <th className="px-3 py-2 text-right font-semibold">Easting</th>
                <th className="px-3 py-2 text-right font-semibold">Northing</th>
                <th className="px-3 py-2 text-right font-semibold">Height</th>
                <th className="px-5 py-2 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {points.map((p) => (
                <tr key={p._id} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="px-5 py-2 font-medium text-slate-800">{p.name}</td>
                  <td className="num px-3 py-2 text-right text-slate-600">{fmt(p.easting, coordDp)}</td>
                  <td className="num px-3 py-2 text-right text-slate-600">{fmt(p.northing, coordDp)}</td>
                  <td className="num px-3 py-2 text-right text-slate-600">{fmt(p.height, coordDp)}</td>
                  <td className="px-5 py-2 text-right">
                    <button onClick={() => startEdit(p)} className="text-xs font-medium text-brand-600 hover:underline">
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

function F({ label, children }) {
  const id = useId();
  const input =
    isValidElement(children) && children.props.id == null
      ? cloneElement(children, { id })
      : children;
  return (
    <div>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      {input}
    </div>
  );
}

function num(v) {
  if (v === "" || v === null || v === undefined) return null;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}
