import type { Thresholds } from '../config.js';
import { ZERO_METRICS, groupMetrics, normalizePageUrl, pctChange } from '../metrics.js';
import type { LosingFinding, LossCause, Metrics, PeriodData } from '../types.js';
import { topPageByQuery } from './striking.js';

/**
 * Classifies a click loss by looking at which factor moved:
 * gone from the results → ranking got worse → fewer impressions at a stable
 * ranking (demand/seasonality) → fewer clicks at stable ranking and demand
 * (CTR: SERP features, AI answers, a weaker snippet) → mixed.
 */
export function classifyLoss(current: Metrics, previous: Metrics, t: Thresholds['losers']): LossCause {
  if (current.impressions === 0) return 'disappeared';
  if (current.position - previous.position >= t.positionDrop) return 'ranking-drop';
  if (pctChange(current.impressions, previous.impressions) <= -t.demandDropPct) return 'demand-drop';
  if (pctChange(current.ctr, previous.ctr) <= -t.ctrDropPct) return 'ctr-drop';
  return 'mixed';
}

function compare(
  kind: LosingFinding['kind'],
  currentByKey: Map<string, Metrics>,
  previousByKey: Map<string, Metrics>,
  t: Thresholds['losers'],
  pageOf?: Map<string, string>,
): LosingFinding[] {
  const findings: LosingFinding[] = [];
  for (const [key, previous] of previousByKey) {
    const current = currentByKey.get(key) ?? ZERO_METRICS;
    const clickDelta = current.clicks - previous.clicks;
    const clickDeltaPct = pctChange(current.clicks, previous.clicks);
    if (clickDelta > -t.minClickLoss || clickDeltaPct > -t.minClickLossPct) continue;
    findings.push({
      kind,
      key,
      page: pageOf?.get(key),
      current,
      previous,
      clickDelta,
      clickDeltaPct,
      impressionDeltaPct: pctChange(current.impressions, previous.impressions),
      ctrDeltaPct: pctChange(current.ctr, previous.ctr),
      positionDelta: current.impressions > 0 ? current.position - previous.position : 0,
      cause: classifyLoss(current, previous, t),
      // clicks = impressions × CTR, so the change splits exactly into a volume and a CTR part.
      volumeEffect: (current.impressions - previous.impressions) * previous.ctr,
      ctrEffect: current.impressions * (current.ctr - previous.ctr),
    });
  }
  return findings.sort((a, b) => a.clickDelta - b.clickDelta);
}

export function findLosingPages(current: PeriodData, previous: PeriodData, t: Thresholds['losers']): LosingFinding[] {
  const key = (row: { page: string }) => normalizePageUrl(row.page);
  return compare('page', groupMetrics(current.pages, key), groupMetrics(previous.pages, key), t);
}

export function findLosingQueries(current: PeriodData, previous: PeriodData, t: Thresholds['losers']): LosingFinding[] {
  const key = (row: { query: string }) => row.query;
  return compare('query', groupMetrics(current.queries, key), groupMetrics(previous.queries, key), t, topPageByQuery(previous));
}
