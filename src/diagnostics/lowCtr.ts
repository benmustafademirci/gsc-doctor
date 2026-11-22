import type { Thresholds } from '../config.js';
import { isBranded } from '../config.js';
import { expectedCtr } from '../ctr.js';
import { combineMetrics, groupMetrics, normalizePageUrl } from '../metrics.js';
import type { LowCtrFinding, PeriodData, QueryPageRow } from '../types.js';

/** Query rows must cover at least this share of a page's impressions to be trusted. */
const MIN_QUERY_COVERAGE = 0.5;

/**
 * Low CTR for position: pages that earn clearly fewer clicks than their
 * rankings deserve — prime candidates for a new title and meta description.
 *
 * Expected clicks are computed per query (impressions × expected CTR at that
 * query's position) and summed, so a page that ranks #2 for one query and #9
 * for another is judged fairly. Brand queries are excluded. When Search
 * Console hides too many of the page's queries (anonymized queries), the
 * page's own average position is used instead.
 */
export function findLowCtrPages(
  period: PeriodData,
  curve: readonly number[],
  t: Thresholds['lowCtr'],
  brandTerms: readonly string[],
): LowCtrFinding[] {
  const rowsByPage = new Map<string, QueryPageRow[]>();
  for (const row of period.queryPages) {
    const page = normalizePageUrl(row.page);
    const list = rowsByPage.get(page);
    const normalized = { ...row, page };
    if (list) list.push(normalized);
    else rowsByPage.set(page, [normalized]);
  }

  const pageTotals = new Map<string, ReturnType<typeof combineMetrics>>();
  const pageRowsByUrl = new Map<string, typeof period.pages>();
  for (const row of period.pages) {
    const page = normalizePageUrl(row.page);
    const list = pageRowsByUrl.get(page);
    if (list) list.push(row);
    else pageRowsByUrl.set(page, [row]);
  }
  for (const [page, rows] of pageRowsByUrl) pageTotals.set(page, combineMetrics(rows));

  const findings: LowCtrFinding[] = [];
  const allPages = new Set([...pageTotals.keys(), ...rowsByPage.keys()]);

  for (const page of allPages) {
    const total = pageTotals.get(page);
    const allRows = rowsByPage.get(page) ?? [];
    const known = combineMetrics(allRows);
    const queryRows = allRows.filter((r) => !isBranded(r.query, brandTerms));
    const covered = combineMetrics(queryRows);
    const useQueries = allRows.length > 0 && (!total || known.impressions >= total.impressions * MIN_QUERY_COVERAGE);
    // Pages found almost only through brand queries are not snippet problems.
    if (useQueries && queryRows.length === 0) continue;

    let impressions: number;
    let clicks: number;
    let position: number;
    let expectedClicks: number;
    if (useQueries) {
      impressions = covered.impressions;
      clicks = covered.clicks;
      position = covered.position;
      expectedClicks = queryRows.reduce((sum, r) => sum + r.impressions * expectedCtr(curve, r.position), 0);
    } else if (total) {
      impressions = total.impressions;
      clicks = total.clicks;
      position = total.position;
      expectedClicks = impressions * expectedCtr(curve, position);
    } else {
      continue;
    }

    if (impressions < t.minImpressions || position > t.maxPosition || expectedClicks <= 0) continue;
    const ratio = clicks / expectedClicks;
    if (ratio >= t.maxCtrRatio) continue;

    findings.push({
      page,
      clicks,
      impressions,
      ctr: impressions > 0 ? clicks / impressions : 0,
      position,
      expectedCtr: expectedClicks / impressions,
      ctrRatio: ratio,
      potentialClicks: expectedClicks - clicks,
      basis: useQueries ? 'queries' : 'page',
      // A query can appear twice when #fragment URLs were merged into the page.
      topQueries: [...groupMetrics(queryRows, (r) => r.query)]
        .map(([query, m]) => ({ query, page, ...m }))
        .sort((a, b) => b.impressions - a.impressions)
        .slice(0, 5),
    });
  }

  return findings.sort((a, b) => b.potentialClicks - a.potentialClicks);
}
