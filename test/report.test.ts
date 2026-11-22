import { describe, expect, it } from 'vitest';
import { resolveConfig } from '../src/config.js';
import { DEMO_BRAND_TERMS, generateDemoDataset } from '../src/demo/generate.js';
import { DEMO_SAMPLE_AI } from '../src/demo/sampleAi.js';
import { diagnose } from '../src/diagnostics/index.js';
import { jsonForScript } from '../src/report/escape.js';
import { renderReport, siteLabel } from '../src/report/html.js';
import { dataset, p, q, qp } from './fixtures.js';

const now = new Date('2026-11-22T12:00:00Z');
const config = resolveConfig({ brandTerms: DEMO_BRAND_TERMS });

describe('renderReport', () => {
  const d = diagnose(generateDemoDataset({ endDate: '2026-11-19', now }), config, now);
  const html = renderReport(d, { version: '9.9.9', config, ai: DEMO_SAMPLE_AI });

  it('is a single self-contained file (no external scripts, styles, fonts or images)', () => {
    expect(html).not.toMatch(/<script[^>]+src=/i);
    expect(html).not.toMatch(/<link\b/i);
    expect(html).not.toMatch(/@import|url\(\s*["']?https?:/i);
    expect(html).not.toMatch(/<img\b/i);
  });

  it('contains every section', () => {
    for (const id of ['summary', 'actions', 'striking', 'low-ctr', 'losers', 'cannibalization', 'method']) {
      expect(html).toContain(`id="${id}"`);
    }
    expect(html).toContain('SEO check-up for <span class="site">example.com</span>');
    expect(html).toContain('Demo data');
    expect(html).toContain('Sample output');
  });

  it('escapes user-generated queries and URLs', () => {
    const evil = '<script>alert(1)</script>';
    const data = dataset(
      {
        queries: [q(evil, 1, 1000, 8)],
        pages: [p('/x/', 1, 1000, 8)],
        queryPages: [qp(evil, '/x/"><img src=x onerror=alert(1)>', 1, 1000, 8)],
      },
      {},
    );
    const out = renderReport(diagnose(data, resolveConfig(), now), { version: '0.0.0', config: resolveConfig() });
    expect(out).not.toContain(evil);
    expect(out).not.toContain('<img src=x');
    expect(out).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('explains how to enable AI when no key is configured', () => {
    const out = renderReport(d, { version: '0.0.0', config });
    expect(out).toContain('GEMINI_API_KEY');
    expect(out).not.toContain('Sample output');
  });
});

describe('helpers', () => {
  it('labels properties nicely', () => {
    expect(siteLabel('sc-domain:example.com')).toBe('example.com');
    expect(siteLabel('https://www.example.com/')).toBe('www.example.com');
    expect(siteLabel('https://example.com/blog/')).toBe('example.com/blog/');
  });

  it('produces JSON that cannot close a script tag', () => {
    const json = jsonForScript({ q: '</script><script>alert(1)</script>', s: `a${String.fromCharCode(0x2028)}b` });
    expect(json).not.toContain('</script>');
    expect(json).toContain('\\u2028');
    expect(JSON.parse(json).q).toBe('</script><script>alert(1)</script>');
  });
});
