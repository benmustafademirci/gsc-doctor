import { describe, expect, it, vi } from 'vitest';
import type { AuthProvider } from '../src/gsc/auth.js';
import { GscApiError, GscClient, MAX_ROW_LIMIT, type SearchAnalyticsRequest } from '../src/gsc/client.js';
import { fetchDataset, matchSite } from '../src/gsc/fetch.js';

const auth: AuthProvider = {
  description: 'test',
  principal: 'reporter@demo-project.iam.gserviceaccount.com',
  getHeaders: async () => ({ authorization: 'Bearer test' }),
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const row = (keys: string[], clicks = 1, impressions = 10, position = 5) => ({ keys, clicks, impressions, ctr: clicks / impressions, position });

describe('GscClient', () => {
  it('URL-encodes the property and posts the request body', async () => {
    const fetchImpl = vi.fn(async () => json({ rows: [row(['a'])] }));
    const client = new GscClient(auth, { fetchImpl: fetchImpl as never });
    await client.query('sc-domain:example.com', { startDate: '2026-11-01', endDate: '2026-11-02', dimensions: ['query'] });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://www.googleapis.com/webmasters/v3/sites/sc-domain%3Aexample.com/searchAnalytics/query');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toMatchObject({ dimensions: ['query'] });
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer test');
  });

  it('pages through results 25,000 rows at a time', async () => {
    const bodies: SearchAnalyticsRequest[] = [];
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as SearchAnalyticsRequest;
      bodies.push(body);
      const count = body.startRow === 0 ? MAX_ROW_LIMIT : 3;
      return json({ rows: Array.from({ length: count }, (_, i) => row([`q${body.startRow! + i}`])) });
    });
    const client = new GscClient(auth, { fetchImpl: fetchImpl as never });
    const rows = await client.queryAll('https://example.com/', { startDate: '2026-11-01', endDate: '2026-11-02', dimensions: ['query'] }, 100_000);
    expect(rows).toHaveLength(MAX_ROW_LIMIT + 3);
    expect(bodies.map((b) => [b.startRow, b.rowLimit])).toEqual([
      [0, MAX_ROW_LIMIT],
      [MAX_ROW_LIMIT, MAX_ROW_LIMIT],
    ]);
  });

  it('stops at maxRows', async () => {
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as SearchAnalyticsRequest;
      return json({ rows: Array.from({ length: body.rowLimit! }, (_, i) => row([`q${i}`])) });
    });
    const client = new GscClient(auth, { fetchImpl: fetchImpl as never });
    const rows = await client.queryAll('https://example.com/', { startDate: '2026-11-01', endDate: '2026-11-02', dimensions: ['query'] }, 1000);
    expect(rows).toHaveLength(1000);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('retries rate limits and server errors', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(json({ error: { message: 'Quota exceeded' } }, 429))
      .mockResolvedValueOnce(json({ error: { message: 'Backend error' } }, 503))
      .mockResolvedValueOnce(json({ siteEntry: [{ siteUrl: 'sc-domain:example.com', permissionLevel: 'siteRestrictedUser' }] }));
    const client = new GscClient(auth, { fetchImpl: fetchImpl as never, sleep: async () => {} });
    expect(await client.listSites()).toHaveLength(1);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('explains permission errors with the account email', async () => {
    const fetchImpl = vi.fn(async () => json({ error: { code: 403, message: 'User does not have sufficient permission for site' } }, 403));
    const client = new GscClient(auth, { fetchImpl: fetchImpl as never });
    const error = await client
      .query('sc-domain:example.com', { startDate: '2026-11-01', endDate: '2026-11-02', dimensions: ['query'] })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(GscApiError);
    expect((error as GscApiError).status).toBe(403);
    expect((error as GscApiError).hint).toContain('reporter@demo-project.iam.gserviceaccount.com');
    expect((error as GscApiError).hint).toContain('Users and permissions');
  });

  it('points to the API library when the API is disabled', async () => {
    const fetchImpl = vi.fn(async () => json({ error: { message: 'Google Search Console API has not been used in project 123 before or it is disabled.' } }, 403));
    const client = new GscClient(auth, { fetchImpl: fetchImpl as never });
    const error = (await client.listSites().catch((e: unknown) => e)) as GscApiError;
    expect(error.hint).toContain('searchconsole.googleapis.com');
  });
});

describe('fetchDataset', () => {
  it('finds the latest complete day and fetches both 28-day periods', async () => {
    const requests: SearchAnalyticsRequest[] = [];
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as SearchAnalyticsRequest;
      requests.push(body);
      if (body.dimensions.join() === 'date' && body.rowLimit === 20) {
        return json({ rows: [row(['2026-11-18']), row(['2026-11-19'])] });
      }
      if (body.dimensions.join() === 'date') return json({ rows: [row(['2026-11-19'], 5, 50), row(['2026-09-25'], 4, 40)] });
      if (body.dimensions.join() === 'query,page') return json({ rows: [row(['trail shoes', 'https://example.com/a/'])] });
      return json({ rows: [row([body.dimensions[0] === 'query' ? 'trail shoes' : 'https://example.com/a/'])] });
    });
    const client = new GscClient(auth, { fetchImpl: fetchImpl as never });
    const data = await fetchDataset(client, { siteUrl: 'sc-domain:example.com', now: new Date('2026-11-22T12:00:00Z') });

    expect(data.current.range).toEqual({ start: '2026-10-23', end: '2026-11-19' });
    expect(data.previous.range).toEqual({ start: '2026-09-25', end: '2026-10-22' });
    expect(data.daily.map((d) => d.date)).toEqual(['2026-09-25', '2026-11-19']);
    expect(data.current.queryPages[0]).toMatchObject({ query: 'trail shoes', page: 'https://example.com/a/' });
    expect(requests.every((r) => r.dataState === 'final' && (r.type ?? 'web') === 'web')).toBe(true);
    expect(requests).toHaveLength(8); // latest-date probe + daily + 3 × 2 periods
  });
});

describe('matchSite', () => {
  const sites = ['sc-domain:example.com', 'https://www.example.com/', 'https://shop.example.org/'];

  it('accepts exact property names', () => {
    expect(matchSite('https://www.example.com/', sites).match).toBe('https://www.example.com/');
  });

  it('resolves a bare domain, preferring the domain property', () => {
    expect(matchSite('example.com', sites).match).toBe('sc-domain:example.com');
    expect(matchSite('shop.example.org', sites).match).toBe('https://shop.example.org/');
  });

  it('returns no match for unknown sites', () => {
    expect(matchSite('example.net', sites).match).toBeUndefined();
  });
});
