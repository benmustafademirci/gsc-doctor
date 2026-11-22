import type { Thresholds } from '../config.js';
import { isBranded } from '../config.js';
import { expectedCtr } from '../ctr.js';
import { combineMetrics, normalizePageUrl } from '../metrics.js';
import type { CannibalizationFinding, CannibalizingPage, PeriodData, QueryPageRow } from '../types.js';

/**
 * Keyword cannibalization: two or more of your pages each take a meaningful
 * share of the impressions for the same query, so Google keeps switching
 * between them and neither ranks as well as one consolidated page could.
 *
 * #fragment URLs are merged into their page first, so "jump to" links are not
 * mistaken for competing pages. The upside assumes the query's impressions
 * would convert at the best competing page's position.
 */
export function findCannibalization(
  period: PeriodData,
  curve: readonly number[],
  t: Thresholds['cannibalization'],
  brandTerms: readonly string[],
): CannibalizationFinding[] {
  const byQuery = new Map<string, Map<string, QueryPageRow[]>>();
  for (const row of period.queryPages) {
    if (!t.includeBranded && isBranded(row.query, brandTerms)) continue;
    const page = normalizePageUrl(row.page);
    let pages = byQuery.get(row.query);
    if (!pages) byQuery.set(row.query, (pages = new Map()));
    const list = pages.get(page);
    if (list) list.push(row);
    else pages.set(page, [row]);
  }

  const findings: CannibalizationFinding[] = [];
  for (const [query, pageRows] of byQuery) {
    if (pageRows.size < 2) continue;
    const pages = [...pageRows].map(([page, rows]) => ({ page, ...combineMetrics(rows) }));
    const totals = combineMetrics(pages);
    if (totals.impressions < t.minImpressions) continue;

    const competing: CannibalizingPage[] = pages
      .map((p) => ({ ...p, share: p.impressions / totals.impressions }))
      .filter((p) => p.share >= t.minPageShare)
      .sort((a, b) => b.impressions - a.impressions);
    if (competing.length < 2) continue;

    const primary = [...competing].sort((a, b) => b.clicks - a.clicks || a.position - b.position)[0]!;
    const bestPosition = Math.min(...competing.map((p) => p.position));
    const maxShare = Math.max(...competing.map((p) => p.share));
    findings.push({
      query,
      clicks: totals.clicks,
      impressions: totals.impressions,
      pages: competing,
      primaryPage: primary.page,
      bestPosition,
      splitScore: 1 - maxShare,
      potentialClicks: Math.max(0, totals.impressions * expectedCtr(curve, bestPosition) - totals.clicks),
    });
  }

  return findings.sort((a, b) => b.potentialClicks - a.potentialClicks || b.impressions - a.impressions);
}
