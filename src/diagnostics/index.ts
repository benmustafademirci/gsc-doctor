import type { Config } from '../config.js';
import { DEFAULT_CTR_CURVE, buildCtrCurve } from '../ctr.js';
import { eachDay } from '../dates.js';
import { combineMetrics, groupMetrics, normalizePageUrl } from '../metrics.js';
import type { Dataset, Diagnosis } from '../types.js';
import { findCannibalization } from './cannibalization.js';
import { findLosingPages, findLosingQueries } from './losers.js';
import { findLowCtrPages } from './lowCtr.js';
import { prioritize } from './priority.js';
import { findStrikingDistance } from './striking.js';
import { buildSummary } from './summary.js';

/** Runs every deterministic diagnostic on a dataset. Pure: same input, same output. */
export function diagnose(dataset: Dataset, config: Config, now: Date = new Date()): Diagnosis {
  const t = config.thresholds;
  const { current, previous } = dataset;

  const inRange = (date: string, range: { start: string; end: string }) => date >= range.start && date <= range.end;
  const totals = {
    current: combineMetrics(dataset.daily.filter((d) => inRange(d.date, current.range))),
    previous: combineMetrics(dataset.daily.filter((d) => inRange(d.date, previous.range))),
  };

  const ctrCurve = buildCtrCurve(current.queries, t.ctr, config.brandTerms);
  const curve = ctrCurve.points;

  const striking = findStrikingDistance(current, curve, t.striking);
  const lowCtr = findLowCtrPages(current, curve, t.lowCtr, config.brandTerms);
  const losingPages = findLosingPages(current, previous, t.losers);
  const losingQueries = findLosingQueries(current, previous, t.losers);
  const cannibalization = findCannibalization(current, curve, t.cannibalization, config.brandTerms);
  const actions = prioritize({ striking, lowCtr, losingPages, losingQueries, cannibalization });

  const pagePoints = [...groupMetrics(current.pages, (r) => normalizePageUrl(r.page))]
    .filter(([, m]) => m.impressions >= t.lowCtr.minImpressions && m.position >= 1 && m.position <= 20)
    .map(([page, m]) => ({ page, position: m.position, ctr: m.ctr, impressions: m.impressions }));

  const days = eachDay(current.range).length;
  const summary = buildSummary({ totals, days, striking, lowCtr, losingPages, cannibalization, actions });

  return {
    siteUrl: dataset.siteUrl,
    searchType: dataset.searchType,
    source: dataset.source,
    generatedAt: now.toISOString(),
    fetchedAt: dataset.fetchedAt,
    current: current.range,
    previous: previous.range,
    totals,
    daily: dataset.daily,
    ctrCurve,
    defaultCurve: [...DEFAULT_CTR_CURVE],
    pagePoints,
    striking,
    lowCtr,
    losingPages,
    losingQueries,
    cannibalization,
    actions,
    summary,
    pageMeta: dataset.pageMeta ?? {},
  };
}
