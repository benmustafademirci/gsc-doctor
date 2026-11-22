/**
 * Minimal Search Console API client over fetch.
 * Reference: https://developers.google.com/webmaster-tools/v1/searchanalytics/query
 */
import type { SearchType } from '../types.js';
import type { AuthProvider } from './auth.js';

const API_ROOT = 'https://www.googleapis.com/webmasters/v3';
/** The API's maximum rows per request. */
export const MAX_ROW_LIMIT = 25_000;

export type Dimension = 'query' | 'page' | 'date' | 'country' | 'device' | 'searchAppearance';

export interface SearchAnalyticsRequest {
  startDate: string;
  endDate: string;
  dimensions: Dimension[];
  type?: SearchType;
  rowLimit?: number;
  startRow?: number;
  /** 'final' (default) = complete days only; 'all' includes fresh, partial data. */
  dataState?: 'final' | 'all';
  aggregationType?: 'auto' | 'byPage' | 'byProperty';
}

export interface ApiRow {
  keys?: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface SiteEntry {
  siteUrl: string;
  permissionLevel: string;
}

export class GscApiError extends Error {
  override name = 'GscApiError';
  constructor(
    message: string,
    readonly status: number,
    readonly hint?: string,
  ) {
    super(message);
  }
}

type FetchLike = typeof fetch;

export interface GscClientOptions {
  fetchImpl?: FetchLike;
  /** Retries for 429/5xx responses. */
  retries?: number;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export class GscClient {
  private readonly fetchImpl: FetchLike;
  private readonly retries: number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(
    private readonly auth: AuthProvider,
    options: GscClientOptions = {},
  ) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.retries = options.retries ?? 3;
    this.sleep = options.sleep ?? defaultSleep;
  }

  private explain(status: number, message: string, siteUrl?: string): string | undefined {
    const who = this.auth.principal ? `"${this.auth.principal}"` : 'the account you authenticated with';
    if (status === 403 && /has not been used|is disabled|SERVICE_DISABLED|accessNotConfigured/i.test(message)) {
      return 'Enable the "Google Search Console API" for your Google Cloud project: https://console.cloud.google.com/apis/library/searchconsole.googleapis.com';
    }
    if (status === 403 && /insufficient.*scope|ACCESS_TOKEN_SCOPE_INSUFFICIENT/i.test(message)) {
      return 'The token lacks the https://www.googleapis.com/auth/webmasters.readonly scope. Re-create it with that scope.';
    }
    if (status === 403 && /quota project|x-goog-user-project/i.test(message)) {
      return 'User credentials need a quota project: run `gcloud auth application-default set-quota-project YOUR_PROJECT_ID`.';
    }
    if (status === 403) {
      return siteUrl
        ? `${who} has no access to ${siteUrl}. In Search Console open Settings → Users and permissions → Add user, enter that email with "Restricted" permission, and check the property name (run \`gsc-doctor sites\`).`
        : `${who} cannot use the Search Console API.`;
    }
    if (status === 401) return 'The access token was rejected or has expired. Check your credentials.';
    if (status === 404) return 'Property not found. Use the exact property name, e.g. "sc-domain:example.com" or "https://www.example.com/" (run `gsc-doctor sites`).';
    if (status === 429) return 'Search Console API quota exceeded. Wait ~15 minutes and try again, or lower --max-rows.';
    return undefined;
  }

  private async request<T>(method: 'GET' | 'POST', url: string, body?: unknown, siteUrl?: string): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      const headers: Record<string, string> = { ...(await this.auth.getHeaders()), accept: 'application/json' };
      if (body !== undefined) headers['content-type'] = 'application/json';
      let response: Response;
      try {
        response = await this.fetchImpl(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
      } catch (error) {
        if (attempt < this.retries) {
          await this.sleep(500 * 2 ** attempt);
          continue;
        }
        throw new GscApiError(`Network error calling Search Console: ${(error as Error).message}`, 0);
      }
      if (response.ok) return (await response.json()) as T;

      const retryable = response.status === 429 || response.status >= 500;
      if (retryable && attempt < this.retries) {
        await this.sleep(1000 * 2 ** attempt);
        continue;
      }
      const payload = (await response.json().catch(() => ({}))) as {
        error?: { message?: string; status?: string; errors?: Array<{ reason?: string }> };
      };
      const message = [payload.error?.message, payload.error?.status, ...(payload.error?.errors ?? []).map((x) => x.reason)]
        .filter(Boolean)
        .join(' · ');
      throw new GscApiError(
        `Search Console API error ${response.status}: ${payload.error?.message ?? response.statusText}`,
        response.status,
        this.explain(response.status, message, siteUrl),
      );
    }
  }

  async listSites(): Promise<SiteEntry[]> {
    const data = await this.request<{ siteEntry?: SiteEntry[] }>('GET', `${API_ROOT}/sites`);
    return data.siteEntry ?? [];
  }

  async query(siteUrl: string, body: SearchAnalyticsRequest): Promise<ApiRow[]> {
    const url = `${API_ROOT}/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`;
    const data = await this.request<{ rows?: ApiRow[] }>('POST', url, body, siteUrl);
    return data.rows ?? [];
  }

  /**
   * Pages through results (25,000 rows per request) until the API returns a
   * short page or `maxRows` is reached. The API returns top rows by clicks.
   */
  async queryAll(siteUrl: string, body: Omit<SearchAnalyticsRequest, 'rowLimit' | 'startRow'>, maxRows: number): Promise<ApiRow[]> {
    const rows: ApiRow[] = [];
    while (rows.length < maxRows) {
      const rowLimit = Math.min(MAX_ROW_LIMIT, maxRows - rows.length);
      const page = await this.query(siteUrl, { ...body, rowLimit, startRow: rows.length });
      rows.push(...page);
      if (page.length < rowLimit) break;
    }
    return rows;
  }
}
