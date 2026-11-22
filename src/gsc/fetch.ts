import { addDays, comparisonWindows, todayInPacific } from '../dates.js';
import type { DailyRow, Dataset, DateRange, PageRow, PeriodData, QueryPageRow, QueryRow, SearchType } from '../types.js';
import type { ApiRow, GscClient } from './client.js';

export interface FetchDatasetOptions {
  siteUrl: string;
  searchType?: SearchType;
  days?: number;
  /** Row cap per query/page/query+page request and period. */
  maxRows?: number;
  now?: Date;
  onProgress?: (message: string) => void;
}

export class NoDataError extends Error {
  override name = 'NoDataError';
}

const metrics = (row: ApiRow) => ({ clicks: row.clicks, impressions: row.impressions, ctr: row.ctr, position: row.position });

/**
 * Finds the most recent complete day. Search Console data usually lags 2–3
 * days; the docs suggest a date-grouped query over the last 10 days.
 */
export async function findLatestDate(client: GscClient, siteUrl: string, searchType: SearchType, now: Date): Promise<string> {
  const today = todayInPacific(now);
  const rows = await client.query(siteUrl, {
    startDate: addDays(today, -10),
    endDate: today,
    dimensions: ['date'],
    type: searchType,
    dataState: 'final',
    rowLimit: 20,
  });
  const dates = rows.map((r) => r.keys?.[0]).filter((d): d is string => !!d).sort();
  const latest = dates[dates.length - 1];
  if (!latest) {
    throw new NoDataError(`Search Console returned no ${searchType} data for ${siteUrl} in the last 10 days. Is the property new, or is the search type right?`);
  }
  return latest;
}

async function fetchPeriod(client: GscClient, siteUrl: string, range: DateRange, searchType: SearchType, maxRows: number): Promise<PeriodData> {
  const base = { startDate: range.start, endDate: range.end, type: searchType, dataState: 'final' as const };
  const [queryRows, pageRows, queryPageRows] = await Promise.all([
    client.queryAll(siteUrl, { ...base, dimensions: ['query'] }, maxRows),
    client.queryAll(siteUrl, { ...base, dimensions: ['page'] }, maxRows),
    client.queryAll(siteUrl, { ...base, dimensions: ['query', 'page'] }, maxRows),
  ]);
  return {
    range,
    queries: queryRows.map((r): QueryRow => ({ query: r.keys?.[0] ?? '', ...metrics(r) })),
    pages: pageRows.map((r): PageRow => ({ page: r.keys?.[0] ?? '', ...metrics(r) })),
    queryPages: queryPageRows.map((r): QueryPageRow => ({ query: r.keys?.[0] ?? '', page: r.keys?.[1] ?? '', ...metrics(r) })),
  };
}

/** Fetches both comparison periods and the daily series (7 paged API calls). */
export async function fetchDataset(client: GscClient, options: FetchDatasetOptions): Promise<Dataset> {
  const now = options.now ?? new Date();
  const searchType = options.searchType ?? 'web';
  const days = options.days ?? 28;
  const maxRows = options.maxRows ?? 25_000;
  const progress = options.onProgress ?? (() => {});

  progress('Finding the latest complete day…');
  const latest = await findLatestDate(client, options.siteUrl, searchType, now);
  const { current, previous } = comparisonWindows(latest, days);

  progress(`Fetching ${current.start} → ${current.end} and ${previous.start} → ${previous.end}…`);
  const [daily, currentData, previousData] = await Promise.all([
    client.queryAll(
      options.siteUrl,
      { startDate: previous.start, endDate: current.end, dimensions: ['date'], type: searchType, dataState: 'final' },
      days * 2 + 10,
    ),
    fetchPeriod(client, options.siteUrl, current, searchType, maxRows),
    fetchPeriod(client, options.siteUrl, previous, searchType, maxRows),
  ]);

  return {
    siteUrl: options.siteUrl,
    searchType,
    source: 'gsc',
    fetchedAt: now.toISOString(),
    current: currentData,
    previous: previousData,
    daily: daily
      .map((r): DailyRow => ({ date: r.keys?.[0] ?? '', ...metrics(r) }))
      .filter((r) => r.date)
      .sort((a, b) => a.date.localeCompare(b.date)),
  };
}

/**
 * Matches what the user typed against their properties, so "example.com"
 * finds "sc-domain:example.com" or "https://www.example.com/".
 */
export function matchSite(input: string, sites: readonly string[]): { match?: string; candidates: string[] } {
  if (sites.includes(input)) return { match: input, candidates: [input] };
  const bare = input
    .replace(/^sc-domain:/, '')
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/$/, '')
    .toLowerCase();
  const candidates = sites.filter((site) => {
    const s = site.replace(/^sc-domain:/, '').replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '').toLowerCase();
    return s === bare;
  });
  if (candidates.length === 1) return { match: candidates[0], candidates };
  // Prefer the domain property when both exist: it covers every protocol and subdomain.
  const domain = candidates.find((c) => c.startsWith('sc-domain:'));
  return { match: domain, candidates };
}
