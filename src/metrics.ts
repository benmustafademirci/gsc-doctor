import type { Metrics } from './types.js';

export const ZERO_METRICS: Metrics = Object.freeze({ clicks: 0, impressions: 0, ctr: 0, position: 0 });

/** Sums clicks/impressions and averages position weighted by impressions. */
export function combineMetrics(rows: readonly Metrics[]): Metrics {
  let clicks = 0;
  let impressions = 0;
  let weightedPosition = 0;
  for (const row of rows) {
    clicks += row.clicks;
    impressions += row.impressions;
    weightedPosition += row.position * row.impressions;
  }
  return {
    clicks,
    impressions,
    ctr: impressions > 0 ? clicks / impressions : 0,
    position: impressions > 0 ? weightedPosition / impressions : 0,
  };
}

/** Relative change; returns 0 when both are 0 and Infinity when growing from 0. */
export function pctChange(current: number, previous: number): number {
  if (previous === 0) return current === 0 ? 0 : Number.POSITIVE_INFINITY;
  return (current - previous) / previous;
}

/**
 * Search Console reports "jump to" links as separate URLs with a #fragment.
 * They are the same document, so diagnostics treat them as one page.
 */
export function normalizePageUrl(url: string): string {
  const hash = url.indexOf('#');
  return hash === -1 ? url : url.slice(0, hash);
}

/** Groups rows by a key, combining their metrics. */
export function groupMetrics<T extends Metrics>(rows: readonly T[], keyOf: (row: T) => string): Map<string, Metrics> {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const key = keyOf(row);
    const list = groups.get(key);
    if (list) list.push(row);
    else groups.set(key, [row]);
  }
  const result = new Map<string, Metrics>();
  for (const [key, list] of groups) result.set(key, combineMetrics(list));
  return result;
}
