import type { Thresholds } from './config.js';
import { isBranded } from './config.js';
import type { CtrCurve, QueryRow } from './types.js';

/**
 * Generic organic CTR by position (index 0 = position 1). A deliberately
 * conservative curve in the range reported by public CTR studies; real CTR
 * varies a lot with SERP features, intent and brand. gsc-doctor prefers a
 * curve learned from your own site (see `buildCtrCurve`) and only falls back
 * to these values where your data is too thin.
 */
export const DEFAULT_CTR_CURVE: readonly number[] = [
  0.28, 0.155, 0.1, 0.072, 0.054, 0.042, 0.033, 0.027, 0.022, 0.019,
  0.014, 0.012, 0.01, 0.009, 0.008, 0.007, 0.006, 0.0055, 0.005, 0.0045,
];

/** CTR assumed for positions worse than 20. */
export const TAIL_CTR = 0.003;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/**
 * Learns a CTR curve from the site's own non-brand queries: the median CTR of
 * queries at each rounded position (medians resist brand/navigational
 * outliers). Positions without enough data use the generic curve, and the
 * result is forced to be non-increasing so position 5 never "expects" more
 * than position 4.
 */
export function buildCtrCurve(
  queries: readonly QueryRow[],
  settings: Thresholds['ctr'],
  brandTerms: readonly string[],
): CtrCurve {
  const fallback = [...DEFAULT_CTR_CURVE];
  if (settings.model === 'default') return { points: fallback, source: 'default', sitePositions: 0 };

  const buckets: number[][] = Array.from({ length: 20 }, () => []);
  for (const row of queries) {
    if (row.impressions < settings.minImpressionsForCurve) continue;
    if (isBranded(row.query, brandTerms)) continue;
    const bucket = Math.round(row.position);
    if (bucket < 1 || bucket > 20) continue;
    buckets[bucket - 1]!.push(row.ctr);
  }

  let sitePositions = 0;
  const points = buckets.map((values, i) => {
    if (values.length >= settings.minQueriesPerPosition) {
      sitePositions++;
      return median(values);
    }
    return fallback[i]!;
  });
  for (let i = 1; i < points.length; i++) points[i] = Math.min(points[i]!, points[i - 1]!);

  return { points, source: sitePositions > 0 ? 'site' : 'default', sitePositions };
}

/** Expected CTR at a (fractional) average position, linearly interpolated. */
export function expectedCtr(curve: readonly number[], position: number): number {
  if (!Number.isFinite(position)) return 0;
  const p = Math.max(1, position);
  if (p > curve.length) return Math.min(TAIL_CTR, curve[curve.length - 1] ?? TAIL_CTR);
  const lower = Math.floor(p);
  const upper = Math.min(curve.length, lower + 1);
  const a = curve[lower - 1]!;
  const b = curve[upper - 1]!;
  return a + (b - a) * (p - lower);
}
