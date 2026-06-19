/**
 * Status badge for a survey point's double-polar result.
 *  - green  : OK (within tolerance, >=2 observations)
 *  - red    : Limit exceeded
 *  - amber  : Single observation (not yet double-polar)
 *  - slate  : No observations
 */
export default function StatusBadge({ computed }) {
  const c = computed || {};
  if (!c.observationCount) {
    return <span className="badge bg-slate-100 text-slate-600">No data</span>;
  }
  if (c.limitExceeded) {
    return <span className="badge bg-red-100 text-red-700">⚠ Limit exceeded</span>;
  }
  if (!c.isDoublePolar) {
    return <span className="badge bg-amber-100 text-amber-700">Single obs.</span>;
  }
  return <span className="badge bg-emerald-100 text-emerald-700">✓ OK</span>;
}
