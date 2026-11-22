/**
 * Optional Gemini layer: turns the deterministic diagnostics into a
 * plain-language summary and new title/description ideas.
 *
 * Calls the Gemini API's generateContent REST endpoint directly (no SDK, so
 * the CLI stays dependency-free and runs on Node 20) with structured JSON
 * output. Only aggregated findings are sent — never the raw Search Console
 * export. Docs: https://ai.google.dev/api/generate-content
 */
import { formatPct, formatPosition, shortUrl } from '../format.js';
import type { AiInsights, Diagnosis, PageMeta, TitleSuggestion } from '../types.js';

/** Stable, low-cost Flash-Lite model; override with --model or GEMINI_MODEL. */
export const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash-lite';
const API_ROOT = 'https://generativelanguage.googleapis.com/v1beta';
const MAX_SUGGESTION_PAGES = 5;

export class GeminiError extends Error {
  override name = 'GeminiError';
}

type FetchLike = typeof fetch;

export interface GeminiOptions {
  apiKey: string;
  model?: string;
  /** Language for the summary and suggestions, e.g. "English", "Turkish", "de". */
  language?: string;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
}

export const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string', description: 'Plain-language summary for a non-technical site owner, at most 90 words.' },
    highlights: {
      type: 'array',
      items: { type: 'string' },
      description: '3 to 5 short, concrete next steps, each starting with a verb, at most 25 words.',
    },
    titleSuggestions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          page: { type: 'string', description: 'The page URL exactly as given in the input.' },
          titles: { type: 'array', items: { type: 'string' }, description: 'Two alternative title tags, at most 60 characters each.' },
          metaDescription: { type: 'string', description: 'One meta description, at most 155 characters.' },
          rationale: { type: 'string', description: 'One sentence on what was wrong with the current snippet.' },
        },
        required: ['page', 'titles', 'metaDescription'],
      },
    },
  },
  required: ['summary', 'highlights', 'titleSuggestions'],
} as const;

const SYSTEM_INSTRUCTION = [
  'You are a senior SEO consultant explaining a Google Search Console check-up to a busy site owner.',
  'Use only the facts in the input. Never invent numbers, prices, years, product features, offers or guarantees.',
  'Be specific and practical. No hype, no emojis.',
  'For title suggestions: lead with the page\'s main query, match its search intent, keep titles under 60 characters and meta descriptions under 155 characters.',
].join(' ');

/** Compact, aggregated view of the diagnosis that is sent to the model. */
export function buildPromptPayload(d: Diagnosis, pageMeta: Record<string, PageMeta>) {
  const round = (n: number) => Math.round(n);
  return {
    site: d.siteUrl,
    periods: { current: d.current, previous: d.previous },
    totals: {
      current: { clicks: round(d.totals.current.clicks), impressions: round(d.totals.current.impressions), ctr: formatPct(d.totals.current.ctr), position: formatPosition(d.totals.current.position) },
      previous: { clicks: round(d.totals.previous.clicks), impressions: round(d.totals.previous.impressions), ctr: formatPct(d.totals.previous.ctr), position: formatPosition(d.totals.previous.position) },
    },
    deterministicSummary: d.summary,
    topActions: d.actions.slice(0, 8).map((a) => ({ title: a.title, estimatedClicks: round(a.estimatedClicks), effort: a.effort })),
    lowCtrPages: d.lowCtr.slice(0, MAX_SUGGESTION_PAGES).map((f) => ({
      page: f.page,
      position: formatPosition(f.position),
      ctr: formatPct(f.ctr),
      expectedCtr: formatPct(f.expectedCtr),
      topQueries: f.topQueries.map((q) => q.query),
      currentTitle: pageMeta[f.page]?.title ?? null,
      currentDescription: pageMeta[f.page]?.description ?? null,
    })),
    losingPages: d.losingPages.slice(0, 5).map((f) => ({ page: shortUrl(f.key), clickChange: round(f.clickDelta), cause: f.cause })),
    strikingDistance: d.striking.slice(0, 8).map((f) => ({ query: f.query, position: formatPosition(f.position), potentialClicks: round(f.potentialClicks) })),
    cannibalization: d.cannibalization.slice(0, 5).map((f) => ({ query: f.query, pages: f.pages.map((p) => shortUrl(p.page)) })),
  };
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string' && v.trim() !== '').map((v) => v.trim()) : [];
}

/** Validates the model's JSON and drops anything malformed or off-target. */
export function parseInsights(text: string, model: string, allowedPages: readonly string[]): AiInsights {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new GeminiError('Gemini returned invalid JSON.');
  }
  const obj = (data ?? {}) as Record<string, unknown>;
  const summary = typeof obj.summary === 'string' ? obj.summary.trim() : '';
  if (!summary) throw new GeminiError('Gemini returned no summary.');
  const allowed = new Set(allowedPages);
  const titleSuggestions: TitleSuggestion[] = (Array.isArray(obj.titleSuggestions) ? obj.titleSuggestions : [])
    .map((raw) => (raw ?? {}) as Record<string, unknown>)
    .filter((s) => typeof s.page === 'string' && allowed.has(s.page))
    .map((s) => ({
      page: s.page as string,
      titles: asStringArray(s.titles).slice(0, 3),
      metaDescription: typeof s.metaDescription === 'string' ? s.metaDescription.trim() : '',
      rationale: typeof s.rationale === 'string' && s.rationale.trim() ? s.rationale.trim() : undefined,
    }))
    .filter((s) => s.titles.length > 0 && s.metaDescription);
  return { model, summary, highlights: asStringArray(obj.highlights).slice(0, 6), titleSuggestions };
}

export async function generateInsights(d: Diagnosis, pageMeta: Record<string, PageMeta>, options: GeminiOptions): Promise<AiInsights> {
  const model = options.model ?? DEFAULT_GEMINI_MODEL;
  const fetchImpl = options.fetchImpl ?? fetch;
  const language = options.language ?? 'English';
  const payload = buildPromptPayload(d, pageMeta);

  const body = {
    systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
    contents: [
      {
        role: 'user',
        parts: [
          {
            text:
              `Write the summary, highlights and title suggestions in ${language}. ` +
              `Suggest new titles and meta descriptions for each page in "lowCtrPages" (keep the "page" value exactly as given).\n\n` +
              `Search Console check-up data:\n${JSON.stringify(payload, null, 2)}`,
          },
        ],
      },
    ],
    generationConfig: {
      responseMimeType: 'application/json',
      responseJsonSchema: RESPONSE_SCHEMA,
    },
  };

  let response: Response;
  try {
    response = await fetchImpl(`${API_ROOT}/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': options.apiKey },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(options.timeoutMs ?? 45_000),
    });
  } catch (error) {
    const reason = (error as Error).name === 'TimeoutError' ? 'request timed out' : (error as Error).message;
    throw new GeminiError(`could not reach the Gemini API (${reason})`);
  }

  const json = (await response.json().catch(() => ({}))) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string; thought?: boolean }> }; finishReason?: string }>;
    promptFeedback?: { blockReason?: string };
    error?: { message?: string; status?: string };
  };
  if (!response.ok) {
    const status = json.error?.status ?? `HTTP ${response.status}`;
    const hint =
      response.status === 400 && /API key/i.test(json.error?.message ?? '')
        ? 'check GEMINI_API_KEY'
        : response.status === 404
          ? `model "${model}" not found — try --model gemini-flash-latest`
          : response.status === 429
            ? 'rate limit or quota reached'
            : json.error?.message;
    throw new GeminiError(`${status}${hint ? `: ${hint}` : ''}`);
  }
  if (json.promptFeedback?.blockReason) throw new GeminiError(`request blocked (${json.promptFeedback.blockReason})`);
  const text = (json.candidates?.[0]?.content?.parts ?? [])
    .filter((p) => !p.thought)
    .map((p) => p.text ?? '')
    .join('');
  if (!text) throw new GeminiError(`empty response (${json.candidates?.[0]?.finishReason ?? 'no candidates'})`);
  return parseInsights(text, model, payload.lowCtrPages.map((p) => p.page));
}
