import { describe, expect, it } from 'vitest';
import { resolveConfig } from '../src/config.js';
import { DEMO_BRAND_TERMS, DEMO_SITE, generateDemoDataset } from '../src/demo/generate.js';
import { diagnose } from '../src/diagnostics/index.js';

const now = new Date('2026-11-22T12:00:00Z');
const make = () => generateDemoDataset({ endDate: '2026-11-19', now });

describe('demo dataset', () => {
  it('is deterministic', () => {
    expect(make()).toEqual(make());
  });

  it('uses two back-to-back 28-day periods and a daily series that matches them', () => {
    const data = make();
    expect(data.current.range).toEqual({ start: '2026-10-23', end: '2026-11-19' });
    expect(data.previous.range).toEqual({ start: '2026-09-25', end: '2026-10-22' });
    expect(data.daily).toHaveLength(56);
    const dailyClicks = data.daily.filter((d) => d.date >= '2026-10-23').reduce((s, d) => s + d.clicks, 0);
    const pageClicks = data.current.pages.reduce((s, r) => s + r.clicks, 0);
    expect(dailyClicks).toBe(pageClicks);
  });

  it('only contains the reserved example.com domain', () => {
    const data = make();
    const urls = [...data.current.pages, ...data.previous.pages].map((r) => r.page);
    expect(data.siteUrl).toBe(DEMO_SITE);
    expect(urls.every((u) => u.startsWith('https://example.com/'))).toBe(true);
  });

  it('gives every diagnostic something to show', () => {
    const d = diagnose(make(), resolveConfig({ brandTerms: DEMO_BRAND_TERMS }), now);
    expect(d.striking.length).toBeGreaterThan(5);
    expect(d.lowCtr.map((f) => f.page)).toContain('https://example.com/blog/how-to-choose-a-sleeping-bag/');
    expect(new Set(d.losingPages.map((f) => f.cause))).toEqual(new Set(['ranking-drop', 'ctr-drop', 'demand-drop', 'disappeared']));
    expect(d.cannibalization.map((f) => f.query)).toEqual(
      expect.arrayContaining(['how to clean hiking boots', 'trail running shoes for beginners', 'winter hiking layers']),
    );
    // The #fragment URL must not be reported as cannibalization.
    expect(d.cannibalization.some((f) => f.query === 'sleeping bag temperature rating')).toBe(false);
    expect(d.actions[0]!.priority).toBe('high');
    expect(d.ctrCurve.source).toBe('site');
  });
});
