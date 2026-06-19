"use client";

import { useEffect, useState, use } from "react";
import Spinner from "@/components/Spinner";
import BackButton from "@/components/BackButton";
import { api } from "@/lib/api";
import { fmt, positionQuality } from "@/lib/survey";

export default function ReportPage({ params }) {
  const { id } = use(params);
  const [job, setJob] = useState(null);
  const [control, setControl] = useState([]);
  const [points, setPoints] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [generatedAt, setGeneratedAt] = useState("");

  useEffect(() => {
    // Set on client only to avoid SSR hydration mismatch.
    setGeneratedAt(new Date().toLocaleString());
    (async () => {
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
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  if (loading) return <Spinner label="Building report…" />;
  if (error)
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        {error}
      </div>
    );
  if (!job) return null;

  const exceeded = points.filter((p) => p.computed?.limitExceeded);
  const tx = job.transformation || {};
  const hx = job.heightTransformation || {};
  const sortedControl = [...control].sort((a, b) => naturalCmp(a.name, b.name));
  const controlByName = Object.fromEntries(control.map((c) => [c.name, c]));
  const isIdentical = (c) => [c.wgs84X, c.wgs84Y, c.wgs84Z].some((v) => v != null);
  const identicalPoints = sortedControl.filter(isIdentical);
  const referencePoints = sortedControl.filter((c) => !isIdentical(c));
  const residualPoints = sortedControl.filter((c) =>
    [c.resE, c.resN, c.resHgt].some((v) => v != null)
  );
  // The "Mean Coordinates and Differences" section only lists double-polar points
  // (2+ observations) — like the original field book.
  const meanPoints = points.filter((p) => (p.computed?.observationCount || 0) >= 2);

  return (
    <div>
      {/* Toolbar (hidden on print) */}
      <div className="no-print mb-4 flex items-center justify-between">
        <BackButton href={`/jobs/${id}`} label="Back to job" />
        <button className="btn-primary" onClick={() => window.print()}>
          🖨 Print / Save as PDF
        </button>
      </div>

      <div className="print-container mx-auto max-w-4xl rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        {/* Header */}
        <div className="mb-6 flex items-end justify-between border-b-2 border-slate-800 pb-3">
          <div className="flex items-center gap-4">
            {job.logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={job.logoUrl} alt="logo" loading="lazy" className="h-14 w-auto" />
            )}
            <div>
              {job.company && (
                <div className="text-sm font-bold uppercase tracking-wide text-brand-700">
                  {job.company}
                </div>
              )}
              <h1 className="text-2xl font-bold text-slate-900">Fieldbook Report</h1>
              <p className="text-sm text-slate-500">
                Generated {generatedAt} · Double-polar cadastral survey
              </p>
            </div>
          </div>
          <div className="text-right text-xs text-slate-500">
            <div className="font-semibold text-slate-700">{job.name}</div>
            {job.coordinateSystemName && <div>{job.coordinateSystemName}</div>}
            {job.projection && <div>{job.projection}</div>}
          </div>
        </div>

        {/* Job information */}
        <Section title="Job Information">
          <Grid>
            <Item label="Job name" value={job.name} />
            <Item
              label="Created"
              value={job.jobCreated || (job.createdAt ? new Date(job.createdAt).toLocaleString() : "")}
            />
            <Item label="Description" value={job.description} />
            <Item label="Creator" value={job.creator} />
            <Item label="Time zone" value={job.timezone} />
            <Item label="Coordinate system name" value={job.coordinateSystemName} />
            <Item label="Application software" value={job.applicationSoftware} />
            <Item label="Firmware version" value={job.firmwareVersion} />
            <Item label="Codelist name" value={job.codelistName} />
            <Item label="Average limit (Position)" value={`${fmt(job.positionLimit)} m`} mono />
            <Item label="Average limit (Height)" value={`${fmt(job.heightLimit)} m`} mono />
          </Grid>
        </Section>

        {/* Coordinate system information */}
        <Section title="Coordinate System Information">
          <Grid>
            <Item label="Coordinate system name" value={job.coordinateSystemName} />
            <Item label="Created" value={job.coordinateSystemCreated} />
            <Item label="Transformation name" value={job.transformationName} />
            <Item label="Transformation type" value={job.transformationType} />
            <Item label="Height mode" value={job.heightMode} />
            <Item label="Pre-transformation name" value={job.preTransformationName} />
            <Item label="Residuals" value={job.residualsFormula} />
            <Item label="Local ellipsoid" value={job.ellipsoid} />
            <Item label="Projection" value={job.projection} />
            <Item label="Geoid model" value={job.geoidModel} />
            <Item label="CSCS model" value={job.cscsModel} />
          </Grid>
        </Section>

        {/* Transformation details */}
        <Section title="Transformation Details">
          <Grid>
            <Item label="Transformation" value={job.transformationType || "2D-Helmert"} />
            <Item label="Number of common points" value={tx.commonPoints != null ? String(tx.commonPoints) : ""} />
            <Item
              label="Rotation origin (X0, Y0)"
              value={
                tx.rotationOriginX != null || tx.rotationOriginY != null
                  ? `${fmt(tx.rotationOriginX)} , ${fmt(tx.rotationOriginY)} m`
                  : ""
              }
              mono
            />
          </Grid>
          {(tx.dE != null || tx.dN != null || tx.rotation || tx.scalePpm != null) && (
            <table className="mt-4 w-full border-collapse text-sm">
              <thead>
                <tr className="border-y border-slate-300 bg-slate-50 text-left">
                  <Th>No.</Th>
                  <Th>Parameter</Th>
                  <Th right>Value</Th>
                </tr>
              </thead>
              <tbody>
                <TransformRow n={1} p="dE" v={tx.dE != null ? `${tx.dE} m` : "-"} />
                <TransformRow n={2} p="dN" v={tx.dN != null ? `${tx.dN} m` : "-"} />
                <TransformRow n={3} p="Rotation" v={tx.rotation || "-"} />
                <TransformRow n={4} p="Scale" v={tx.scalePpm != null ? `${tx.scalePpm} ppm` : "-"} />
              </tbody>
            </table>
          )}
        </Section>

        {/* Height transformation */}
        <Section title="Height Transformation">
          <Grid>
            <Item label="Number of common points" value={hx.commonPoints != null ? String(hx.commonPoints) : "0"} />
            <Item label="Mean transformation accuracy" value={hx.meanAccuracy != null ? `${fmt(hx.meanAccuracy)} m` : "0.0000 m"} mono />
            <Item label="Inclination of height in X" value={hx.inclinationX} />
            <Item label="Inclination of height in Y" value={hx.inclinationY} />
          </Grid>
        </Section>

        {/* Residuals (Grid) */}
        <Section title="Residuals (Grid)">
          {residualPoints.length === 0 ? (
            <EmptyNote>
              No calibration residuals. Add residual dE/dN to your control points (Control points →
              Calibration details) to populate this.
            </EmptyNote>
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-y border-slate-300 bg-slate-50 text-left">
                  <Th>System A</Th>
                  <Th>System B</Th>
                  <Th>Point type</Th>
                  <Th right>dE [m]</Th>
                  <Th right>dN [m]</Th>
                  <Th right>dHgt [m]</Th>
                </tr>
              </thead>
              <tbody>
                {residualPoints.map((c) => (
                  <tr key={c._id} className="border-b border-slate-100">
                    <Td>{c.name}</Td>
                    <Td>{c.name}</Td>
                    <Td>{c.pointType || "Position"}</Td>
                    <Td right mono>{fmt(c.resE)}</Td>
                    <Td right mono>{fmt(c.resN)}</Td>
                    <Td right mono>{fmt(c.resHgt)}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>

        {/* List of identical points (calibration) */}
        <Section title="List of Identical Points">
          {identicalPoints.length === 0 ? (
            <EmptyNote>
              No identical points. Add control points with WGS-84 Cartesian coordinates (Control
              points → Calibration details) to populate System A / System B.
            </EmptyNote>
          ) : (
            <>
              <h3 className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-400">
                System A — WGS-84 Cartesian
              </h3>
              <table className="mb-4 w-full border-collapse text-sm">
                <thead>
                  <tr className="border-y border-slate-300 bg-slate-50 text-left">
                    <Th>Point</Th>
                    <Th right>X [m]</Th>
                    <Th right>Y [m]</Th>
                    <Th right>Z [m]</Th>
                  </tr>
                </thead>
                <tbody>
                  {identicalPoints.map((c) => (
                    <tr key={c._id} className="border-b border-slate-100">
                      <Td>{c.name}</Td>
                      <Td right mono>{fmt(c.wgs84X)}</Td>
                      <Td right mono>{fmt(c.wgs84Y)}</Td>
                      <Td right mono>{fmt(c.wgs84Z)}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <h3 className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-400">
                System B — Local Grid
              </h3>
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-y border-slate-300 bg-slate-50 text-left">
                    <Th>Point</Th>
                    <Th right>Easting [m]</Th>
                    <Th right>Northing [m]</Th>
                    <Th right>Hgt [m]</Th>
                  </tr>
                </thead>
                <tbody>
                  {identicalPoints.map((c) => (
                    <tr key={c._id} className="border-b border-slate-100">
                      <Td>{c.name}</Td>
                      <Td right mono>{fmt(c.easting)}</Td>
                      <Td right mono>{fmt(c.northing)}</Td>
                      <Td right mono>{fmt(c.height)}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </Section>

        {/* Reference / working points (used as a base but not calibration points) */}
        {referencePoints.length > 0 && (
          <Section title="Reference / Working Points (Local Grid)">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-y border-slate-300 bg-slate-50 text-left">
                  <Th>Point</Th>
                  <Th>Type</Th>
                  <Th right>Easting [m]</Th>
                  <Th right>Northing [m]</Th>
                  <Th right>Height [m]</Th>
                </tr>
              </thead>
              <tbody>
                {referencePoints.map((c) => (
                  <tr key={c._id} className="border-b border-slate-100">
                    <Td>{c.name}</Td>
                    <Td>{c.pointType || "Position"}</Td>
                    <Td right mono>{fmt(c.easting)}</Td>
                    <Td right mono>{fmt(c.northing)}</Td>
                    <Td right mono>{fmt(c.height)}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
        )}

        {/* GPS Coordinates / baselines — block layout exactly as the field book:
            Reference station coords AND rover coords side by side, plus quality. */}
        <Section title="GPS Coordinates">
          {points.length === 0 ? (
            <EmptyNote>No survey points recorded.</EmptyNote>
          ) : (
            <div className="space-y-3">
              {points.flatMap((p) =>
                (p.observations || []).map((o, i) => {
                  const ref = controlByName[o.reference] || {};
                  return (
                    <div key={`${p._id}-${i}`} className="rounded-lg border border-slate-200 text-sm">
                      <div className="flex flex-wrap items-center gap-x-8 gap-y-1 border-b border-slate-200 bg-slate-50 px-3 py-1.5">
                        <span className="font-semibold text-slate-700">Baseline</span>
                        <span>
                          <span className="text-slate-400">Reference:</span>{" "}
                          <span className="font-medium text-slate-800">{o.reference || "-"}</span>
                        </span>
                        <span>
                          <span className="text-slate-400">Rover:</span>{" "}
                          <span className="font-medium text-slate-800">{p.name}</span>
                        </span>
                        {o.dateTime && (
                          <span>
                            <span className="text-slate-400">Date/Time:</span> {o.dateTime}
                          </span>
                        )}
                      </div>
                      <div className="px-3 py-2">
                        <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                          Local coordinates
                        </div>
                        <table className="w-full border-collapse text-sm">
                          <thead>
                            <tr className="text-left text-xs text-slate-400">
                              <th className="py-0.5 font-medium"></th>
                              <th className="py-0.5 text-right font-medium">{o.reference || "Reference"}</th>
                              <th className="py-0.5 text-right font-medium">{p.name} (Rover)</th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr>
                              <Td>Easting</Td>
                              <Td right mono>{fmt(ref.easting)} m</Td>
                              <Td right mono>{fmt(o.easting)} m</Td>
                            </tr>
                            <tr>
                              <Td>Northing</Td>
                              <Td right mono>{fmt(ref.northing)} m</Td>
                              <Td right mono>{fmt(o.northing)} m</Td>
                            </tr>
                            <tr>
                              <Td>Ellip. Hgt</Td>
                              <Td right mono>{fmt(ref.height)}</Td>
                              <Td right mono>{fmt(o.height)}</Td>
                            </tr>
                          </tbody>
                        </table>
                        <div className="mb-1 mt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                          Quality
                        </div>
                        <div className="num text-slate-700">
                          Sd. E: {fmt(o.sdE)} m &nbsp; Sd. N: {fmt(o.sdN)} m &nbsp; Sd. Hgt: {fmt(o.sdHgt)} m
                        </div>
                        <div className="num text-slate-700">
                          Posn. Qlty: {fmt(positionQuality(o))} m &nbsp; Sd. Slope: {fmt(o.sdSlope)} m
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </Section>

        {/* Mean coordinates and differences (double-polar points only) */}
        <Section title="Mean Coordinates and Differences">
          {meanPoints.length === 0 ? (
            <EmptyNote>No double-polar points recorded.</EmptyNote>
          ) : (
            <div className="space-y-5">
              {meanPoints.map((p) => (
                <div key={p._id} className="rounded-lg border border-slate-200">
                  <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-3 py-2">
                    <span className="font-semibold text-slate-800">Point {p.name}</span>
                    {p.computed?.limitExceeded ? (
                      <span className="badge bg-red-100 text-red-700">Limit exceeded</span>
                    ) : (
                      <span className="badge bg-emerald-100 text-emerald-700">Within tolerance</span>
                    )}
                  </div>
                  <div className="px-3 pt-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    Avg. Local Coordinates
                  </div>
                  <div className="grid gap-3 px-3 pb-3 pt-1 text-sm sm:grid-cols-4">
                    <Item label="Easting" value={`${fmt(p.computed?.meanEasting)} m`} mono />
                    <Item label="Northing" value={`${fmt(p.computed?.meanNorthing)} m`} mono />
                    <Item label="Ortho. Hgt" value={fmt(p.computed?.meanHeight)} mono />
                    <Item label="CQ" value={`${fmt(p.computed?.cq)} m`} mono />
                  </div>
                  <table className="w-full border-collapse border-t border-slate-100 text-sm">
                    <thead>
                      <tr className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                        <Th>Use</Th>
                        <Th>Limit exceeded</Th>
                        <Th>Reference</Th>
                        <Th>Date / Time</Th>
                        <Th right>Posn. diff [m]</Th>
                        <Th right>Hgt. diff [m]</Th>
                        <Th right>Posn. + Hgt. diff [m]</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {(p.computed?.perObservation || []).map((o, i) => (
                        <tr key={i} className="border-b border-slate-100">
                          <Td>
                            <span className="text-emerald-600">✓</span>
                          </Td>
                          <Td>
                            {p.computed?.limitExceeded ? (
                              <span className="font-semibold text-red-600">Yes</span>
                            ) : (
                              <span className="text-slate-300">—</span>
                            )}
                          </Td>
                          <Td>{o.reference || "-"}</Td>
                          <Td>{o.dateTime || "-"}</Td>
                          <Td right mono>{fmt(o.deviationPosn)}</Td>
                          <Td right mono>{fmt(o.deviationHgt)}</Td>
                          <Td right mono>{fmt(o.deviationCombined)}</Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* Summary footer */}
        <div className="mt-8 border-t-2 border-slate-800 pt-3 text-sm">
          <p className="text-slate-700">
            <span className="font-semibold">Summary:</span> {points.length} survey point
            {points.length === 1 ? "" : "s"}, {control.length} control point
            {control.length === 1 ? "" : "s"}.{" "}
            {exceeded.length === 0 ? (
              <span className="font-semibold text-emerald-700">
                All points within tolerance.
              </span>
            ) : (
              <span className="font-semibold text-red-700">
                {exceeded.length} point{exceeded.length === 1 ? "" : "s"} exceeded the limit:{" "}
                {exceeded.map((p) => p.name).join(", ")}.
              </span>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}

function EmptyNote({ children }) {
  return (
    <p className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-500">
      {children}
    </p>
  );
}

// Natural sort so MTRM4 comes before MTRM13 (not after, as plain string sort).
function naturalCmp(a = "", b = "") {
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
}

function Section({ title, children }) {
  return (
    <section className="mb-6">
      <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-600">{title}</h2>
      {children}
    </section>
  );
}
function Grid({ children }) {
  return <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{children}</div>;
}
function Item({ label, value, mono }) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</div>
      <div className={`text-slate-800 ${mono ? "num" : ""}`}>{value || "-"}</div>
    </div>
  );
}
function Th({ children, right }) {
  return (
    <th className={`px-3 py-2 text-xs font-semibold text-slate-500 ${right ? "text-right" : "text-left"}`}>
      {children}
    </th>
  );
}
function Td({ children, right, mono }) {
  return (
    <td className={`px-3 py-1.5 text-slate-700 ${right ? "text-right" : "text-left"} ${mono ? "num" : ""}`}>
      {children}
    </td>
  );
}
function TransformRow({ n, p, v }) {
  return (
    <tr className="border-b border-slate-100">
      <Td>{n}</Td>
      <Td>{p}</Td>
      <Td right mono>{v}</Td>
    </tr>
  );
}
