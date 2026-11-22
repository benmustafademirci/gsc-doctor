/** Tiny builders for hand-written, fully synthetic test data (example.com only). */
import { resolveConfig, type PartialConfig } from '../src/config.js';
import type { DailyRow, Dataset, PageRow, PeriodData, QueryPageRow, QueryRow } from '../src/types.js';

export const SITE = 'https://example.com/';
export const url = (path: string) => `https://example.com${path}`;

const ctrOf = (clicks: number, impressions: number) => (impressions > 0 ? clicks / impressions : 0);

export const q = (query: string, clicks: number, impressions: number, position: number): QueryRow => ({
  query,
  clicks,
  impressions,
  ctr: ctrOf(clicks, impressions),
  position,
});

export const p = (path: string, clicks: number, impressions: number, position: number): PageRow => ({
  page: url(path),
  clicks,
  impressions,
  ctr: ctrOf(clicks, impressions),
  position,
});

export const qp = (query: string, path: string, clicks: number, impressions: number, position: number): QueryPageRow => ({
  query,
  page: url(path),
  clicks,
  impressions,
  ctr: ctrOf(clicks, impressions),
  position,
});

export const CURRENT = { start: '2026-10-23', end: '2026-11-19' };
export const PREVIOUS = { start: '2026-09-25', end: '2026-10-22' };

export function period(partial: Partial<Omit<PeriodData, 'range'>> = {}, range = CURRENT): PeriodData {
  return { range, queries: partial.queries ?? [], pages: partial.pages ?? [], queryPages: partial.queryPages ?? [] };
}

export function dataset(current: Partial<PeriodData>, previous: Partial<PeriodData> = {}, daily: DailyRow[] = []): Dataset {
  return {
    siteUrl: SITE,
    searchType: 'web',
    source: 'gsc',
    fetchedAt: '2026-11-22T12:00:00.000Z',
    current: period(current, CURRENT),
    previous: period(previous, PREVIOUS),
    daily,
  };
}

/** A flat, known CTR curve makes expected values easy to compute by hand. */
export const FLAT_CURVE = Array.from({ length: 20 }, (_, i) => [0.3, 0.15, 0.1, 0.08, 0.06, 0.05, 0.04, 0.03, 0.025, 0.02][i] ?? 0.01);

export const config = (override?: PartialConfig) => resolveConfig(override);
