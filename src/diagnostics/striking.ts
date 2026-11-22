import type { Thresholds } from '../config.js';
import { expectedCtr } from '../ctr.js';
import { normalizePageUrl } from '../metrics.js';
import type { PeriodData, StrikingDistanceFinding } from '../types.js';

/** The page with the most impressions for each query. */
export function topPageByQuery(period: PeriodData): Map<string, string> {
  const best = new Map<string, { page: string; impressions: number }>();
  for (const row of period.queryPages) {
    const page = normalizePageUrl(row.page);
    const seen = best.get(row.query);
    if (!seen || row.impressions > seen.impressions) best.set(row.query, { page, impressions: row.impressions });
  }
  return new Map([...best].map(([query, v]) => [query, v.page]));
}

/**
 * Striking distance: queries ranking just below the top results with enough
 * impressions that a few positions would bring real traffic. The upside is
 * impressions × (expected CTR at the target position − current CTR).
 */
export function findStrikingDistance(
  period: PeriodData,
  curve: readonly number[],
  t: Thresholds['striking'],
): StrikingDistanceFinding[] {
  const pages = topPageByQuery(period);
  const target = expectedCtr(curve, t.targetPosition);
  const findings: StrikingDistanceFinding[] = [];

  for (const row of period.queries) {
    if (row.position < t.minPosition || row.position > t.maxPosition) continue;
    if (row.impressions < t.minImpressions) continue;
    const potentialClicks = row.impressions * Math.max(0, target - row.ctr);
    if (potentialClicks < 1) continue;
    findings.push({
      query: row.query,
      page: pages.get(row.query),
      clicks: row.clicks,
      impressions: row.impressions,
      ctr: row.ctr,
      position: row.position,
      targetPosition: t.targetPosition,
      expectedCtrAtTarget: target,
      potentialClicks,
    });
  }

  return findings.sort((a, b) => b.potentialClicks - a.potentialClicks || b.impressions - a.impressions);
}
