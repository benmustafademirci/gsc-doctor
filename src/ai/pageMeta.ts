import type { PageMeta } from '../types.js';

const USER_AGENT = 'gsc-doctor (+https://github.com/benmustafademirci/gsc-doctor)';
const MAX_BYTES = 512 * 1024;

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function decodeEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number.parseInt(dec, 10)))
    .replace(/&([a-z]+);/gi, (match, name: string) => ENTITIES[name.toLowerCase()] ?? match)
    .replace(/\s+/g, ' ')
    .trim();
}

/** Pulls <title> and the meta description out of an HTML document. */
export function extractPageMeta(html: string): PageMeta {
  const head = html.slice(0, MAX_BYTES);
  const title = head.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  let description: string | undefined;
  for (const tag of head.match(/<meta\b[^>]*>/gi) ?? []) {
    if (!/\bname\s*=\s*["']?description["']?/i.test(tag)) continue;
    description = tag.match(/\bcontent\s*=\s*"([^"]*)"/i)?.[1] ?? tag.match(/\bcontent\s*=\s*'([^']*)'/i)?.[1];
    break;
  }
  return {
    title: title ? decodeEntities(title) || undefined : undefined,
    description: description ? decodeEntities(description) || undefined : undefined,
  };
}

/**
 * Fetches the live title and description of a few pages so Gemini can see
 * what it is improving on. Failures are ignored — suggestions still work.
 */
export async function fetchPageMeta(urls: readonly string[], fetchImpl: typeof fetch = fetch, timeoutMs = 6000): Promise<Record<string, PageMeta>> {
  const result: Record<string, PageMeta> = {};
  await Promise.all(
    urls
      .filter((url) => /^https?:\/\//i.test(url))
      .map(async (url) => {
        try {
          const response = await fetchImpl(url, {
            headers: { 'user-agent': USER_AGENT, accept: 'text/html' },
            redirect: 'follow',
            signal: AbortSignal.timeout(timeoutMs),
          });
          if (!response.ok || !(response.headers.get('content-type') ?? '').includes('html')) return;
          result[url] = extractPageMeta(await response.text());
        } catch {
          // Unreachable pages simply get no current-snippet context.
        }
      }),
  );
  return result;
}
