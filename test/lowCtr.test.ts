import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../src/config.js';
import { findLowCtrPages } from '../src/diagnostics/lowCtr.js';
import { FLAT_CURVE, p, period, qp, url } from './fixtures.js';

const t = DEFAULT_CONFIG.thresholds.lowCtr; // top 10, ≥300 impressions, ratio < 0.6

describe('findLowCtrPages', () => {
  it('flags a page that earns far fewer clicks than its position deserves', () => {
    const data = period({
      pages: [p('/weak/', 10, 1000, 2), p('/fine/', 140, 1000, 2)],
      queryPages: [qp('weak query', '/weak/', 10, 1000, 2), qp('fine query', '/fine/', 140, 1000, 2)],
    });
    const [weak, ...rest] = findLowCtrPages(data, FLAT_CURVE, t, []);
    expect(rest).toHaveLength(0);
    expect(weak!.page).toBe(url('/weak/'));
    expect(weak!.expectedCtr).toBeCloseTo(0.15);
    expect(weak!.ctrRatio).toBeCloseTo(10 / 150);
    expect(weak!.potentialClicks).toBeCloseTo(140);
    expect(weak!.basis).toBe('queries');
  });

  it('weighs each query at its own position', () => {
    const data = period({
      queryPages: [qp('head term', '/mixed/', 30, 1000, 1), qp('long tail', '/mixed/', 2, 1000, 9)],
    });
    const [finding] = findLowCtrPages(data, FLAT_CURVE, t, []);
    // expected = 1000 × 0.30 + 1000 × 0.025 = 325 clicks; actual 32
    expect(finding!.potentialClicks).toBeCloseTo(293);
    expect(finding!.topQueries.map((r) => r.query)).toEqual(['head term', 'long tail']);
  });

  it('skips pages ranking below the position limit or with too few impressions', () => {
    const data = period({
      queryPages: [qp('deep', '/deep/', 0, 5000, 15), qp('tiny', '/tiny/', 0, 200, 2)],
    });
    expect(findLowCtrPages(data, FLAT_CURVE, t, [])).toEqual([]);
  });

  it('ignores brand queries', () => {
    const data = period({
      pages: [p('/brand/', 10, 1000, 2)],
      queryPages: [qp('example outdoors login', '/brand/', 10, 1000, 2)],
    });
    expect(findLowCtrPages(data, FLAT_CURVE, t, ['example outdoors'])).toEqual([]);
    expect(findLowCtrPages(data, FLAT_CURVE, t, [])).toHaveLength(1);
  });

  it('merges #fragment URLs into their page', () => {
    const data = period({
      queryPages: [qp('jump link', '/guide/#part-2', 5, 600, 2), qp('guide', '/guide/', 5, 600, 2)],
    });
    const findings = findLowCtrPages(data, FLAT_CURVE, t, []);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.page).toBe(url('/guide/'));
    expect(findings[0]!.impressions).toBe(1200);
  });

  it('falls back to the page average when most queries are anonymized', () => {
    const data = period({
      pages: [p('/anon/', 10, 2000, 2)],
      queryPages: [qp('visible query', '/anon/', 1, 100, 2)],
    });
    const [finding] = findLowCtrPages(data, FLAT_CURVE, t, []);
    expect(finding!.basis).toBe('page');
    expect(finding!.impressions).toBe(2000);
    expect(finding!.potentialClicks).toBeCloseTo(2000 * 0.15 - 10);
  });
});
