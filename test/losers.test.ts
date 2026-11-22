import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../src/config.js';
import { classifyLoss, findLosingPages, findLosingQueries } from '../src/diagnostics/losers.js';
import type { Metrics } from '../src/types.js';
import { PREVIOUS, p, period, q, qp, url } from './fixtures.js';

const t = DEFAULT_CONFIG.thresholds.losers;
const m = (clicks: number, impressions: number, position: number): Metrics => ({
  clicks,
  impressions,
  ctr: impressions ? clicks / impressions : 0,
  position,
});

describe('classifyLoss', () => {
  it('detects pages that vanished from search', () => {
    expect(classifyLoss(m(0, 0, 0), m(100, 1000, 3), t)).toBe('disappeared');
  });
  it('detects ranking drops', () => {
    expect(classifyLoss(m(40, 1000, 5), m(100, 1000, 3), t)).toBe('ranking-drop');
  });
  it('detects demand drops at a stable ranking', () => {
    expect(classifyLoss(m(60, 600, 3.2), m(100, 1000, 3), t)).toBe('demand-drop');
  });
  it('detects CTR drops at stable ranking and demand', () => {
    expect(classifyLoss(m(100, 1000, 3), m(200, 1000, 3), t)).toBe('ctr-drop');
  });
  it('falls back to mixed', () => {
    expect(classifyLoss(m(81, 900, 3.5), m(100, 1000, 3), t)).toBe('mixed');
  });
});

describe('findLosingPages', () => {
  const current = period({
    pages: [p('/dropped/', 40, 1000, 6), p('/steady/', 95, 1000, 3), p('/small/', 2, 100, 3), p('/winner/', 300, 3000, 2)],
  });
  const previous = period(
    {
      pages: [p('/dropped/', 100, 1000, 3), p('/steady/', 100, 1000, 3), p('/small/', 8, 100, 3), p('/winner/', 200, 2000, 2), p('/gone/', 50, 800, 4)],
    },
    PREVIOUS,
  );
  const findings = findLosingPages(current, previous, t);

  it('reports only meaningful losses, biggest first', () => {
    expect(findings.map((f) => f.key)).toEqual([url('/dropped/'), url('/gone/')]);
  });

  it('splits the change exactly into an impressions part and a CTR part', () => {
    for (const f of findings) expect(f.volumeEffect + f.ctrEffect).toBeCloseTo(f.clickDelta);
  });

  it('classifies each loss', () => {
    expect(findings.map((f) => f.cause)).toEqual(['ranking-drop', 'disappeared']);
    expect(findings[1]!.current.clicks).toBe(0);
    expect(findings[1]!.clickDeltaPct).toBe(-1);
  });
});

describe('findLosingQueries', () => {
  it('remembers which page served the query before', () => {
    const current = period({ queries: [q('summer checklist', 30, 300, 3)] });
    const previous = period(
      { queries: [q('summer checklist', 100, 1000, 3)], queryPages: [qp('summer checklist', '/checklist/', 100, 1000, 3)] },
      PREVIOUS,
    );
    const [finding] = findLosingQueries(current, previous, t);
    expect(finding!.cause).toBe('demand-drop');
    expect(finding!.page).toBe(url('/checklist/'));
  });
});
