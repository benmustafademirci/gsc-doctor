import { describe, expect, it, vi } from 'vitest';
import { GeminiError, RESPONSE_SCHEMA, generateInsights, parseInsights } from '../src/ai/gemini.js';
import { extractPageMeta, fetchPageMeta } from '../src/ai/pageMeta.js';
import { resolveConfig } from '../src/config.js';
import { DEMO_BRAND_TERMS, generateDemoDataset } from '../src/demo/generate.js';
import { diagnose } from '../src/diagnostics/index.js';

const now = new Date('2026-11-22T12:00:00Z');
const d = diagnose(generateDemoDataset({ endDate: '2026-11-19', now }), resolveConfig({ brandTerms: DEMO_BRAND_TERMS }), now);
const lowCtrPage = d.lowCtr[0]!.page;

const modelReply = (payload: unknown) =>
  new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] }, finishReason: 'STOP' }] }), { status: 200 });

describe('generateInsights', () => {
  it('calls generateContent with the key header and a JSON schema', async () => {
    const fetchImpl = vi.fn(async () =>
      modelReply({
        summary: 'Traffic dipped mainly because of seasonality.',
        highlights: ['Rewrite the sleeping bag title.'],
        titleSuggestions: [
          { page: lowCtrPage, titles: ['How to Choose a Sleeping Bag'], metaDescription: 'A clear guide.' },
          { page: 'https://elsewhere.example/', titles: ['Ignored'], metaDescription: 'Not in input.' },
        ],
      }),
    );
    const insights = await generateInsights(d, d.pageMeta, { apiKey: 'test-key', model: 'gemini-test', language: 'Turkish', fetchImpl: fetchImpl as never });

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-test:generateContent');
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('test-key');
    const body = JSON.parse(String(init.body));
    expect(body.generationConfig).toEqual({ responseMimeType: 'application/json', responseJsonSchema: RESPONSE_SCHEMA });
    expect(body.contents[0].parts[0].text).toContain('in Turkish');
    expect(body.contents[0].parts[0].text).toContain(lowCtrPage);

    expect(insights.model).toBe('gemini-test');
    expect(insights.summary).toContain('seasonality');
    expect(insights.titleSuggestions.map((s) => s.page)).toEqual([lowCtrPage]);
  });

  it('reports API errors without throwing raw responses', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ error: { message: 'models/x is not found', status: 'NOT_FOUND' } }), { status: 404 }));
    await expect(generateInsights(d, {}, { apiKey: 'k', model: 'x', fetchImpl: fetchImpl as never })).rejects.toThrow(/not found/);
  });

  it('fails on blocked or empty responses', async () => {
    const blocked = vi.fn(async () => new Response(JSON.stringify({ promptFeedback: { blockReason: 'SAFETY' } }), { status: 200 }));
    await expect(generateInsights(d, {}, { apiKey: 'k', fetchImpl: blocked as never })).rejects.toThrow(GeminiError);
  });
});

describe('parseInsights', () => {
  it('rejects invalid JSON and missing summaries', () => {
    expect(() => parseInsights('not json', 'm', [])).toThrow(/invalid JSON/);
    expect(() => parseInsights('{"highlights":[]}', 'm', [])).toThrow(/no summary/);
  });

  it('drops malformed suggestions', () => {
    const out = parseInsights(
      JSON.stringify({ summary: 'ok', highlights: ['a', 3, ''], titleSuggestions: [{ page: 'p', titles: [], metaDescription: 'x' }] }),
      'm',
      ['p'],
    );
    expect(out.highlights).toEqual(['a']);
    expect(out.titleSuggestions).toEqual([]);
  });
});

describe('page meta', () => {
  it('extracts and decodes the title and description', () => {
    const html = `<html><head><title> Boots &amp; Shoes | Example </title>
      <meta content="Find boots &#8212; fast." name="description"></head></html>`;
    expect(extractPageMeta(html)).toEqual({ title: 'Boots & Shoes | Example', description: 'Find boots — fast.' });
    expect(extractPageMeta('<html></html>')).toEqual({ title: undefined, description: undefined });
  });

  it('ignores failed or non-HTML responses', async () => {
    const fetchImpl = vi.fn(async (url: string) =>
      url.endsWith('/ok/')
        ? new Response('<title>OK</title>', { headers: { 'content-type': 'text/html; charset=utf-8' } })
        : new Response('{}', { headers: { 'content-type': 'application/json' } }),
    );
    const meta = await fetchPageMeta(['https://example.com/ok/', 'https://example.com/api/', 'ftp://example.com/'], fetchImpl as never);
    expect(meta).toEqual({ 'https://example.com/ok/': { title: 'OK', description: undefined } });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
