import { describe, expect, it } from 'vitest';
import { DEFAULT_CTR_CURVE, TAIL_CTR, buildCtrCurve, expectedCtr } from '../src/ctr.js';
import { DEFAULT_CONFIG } from '../src/config.js';
import { q } from './fixtures.js';

const settings = DEFAULT_CONFIG.thresholds.ctr;

describe('expectedCtr', () => {
  it('returns the curve value at whole positions', () => {
    expect(expectedCtr(DEFAULT_CTR_CURVE, 1)).toBe(DEFAULT_CTR_CURVE[0]);
    expect(expectedCtr(DEFAULT_CTR_CURVE, 3)).toBe(DEFAULT_CTR_CURVE[2]);
  });

  it('interpolates between positions', () => {
    const mid = expectedCtr([0.2, 0.1], 1.5);
    expect(mid).toBeCloseTo(0.15);
  });

  it('clamps positions above 1 and uses the tail beyond the curve', () => {
    expect(expectedCtr(DEFAULT_CTR_CURVE, 0.4)).toBe(DEFAULT_CTR_CURVE[0]);
    expect(expectedCtr(DEFAULT_CTR_CURVE, 45)).toBe(TAIL_CTR);
    expect(expectedCtr(DEFAULT_CTR_CURVE, Number.NaN)).toBe(0);
  });
});

describe('buildCtrCurve', () => {
  it('uses the generic curve when the model is "default"', () => {
    const curve = buildCtrCurve([], { ...settings, model: 'default' }, []);
    expect(curve.source).toBe('default');
    expect(curve.points).toEqual([...DEFAULT_CTR_CURVE]);
  });

  it('learns the median CTR per position when there is enough data', () => {
    const rows = [0.2, 0.22, 0.24, 0.26, 0.9].map((ctr, i) => q(`query ${i}`, Math.round(ctr * 1000), 1000, 1.2));
    const curve = buildCtrCurve(rows, settings, []);
    expect(curve.source).toBe('site');
    expect(curve.sitePositions).toBe(1);
    expect(curve.points[0]).toBeCloseTo(0.24); // median ignores the 0.9 outlier
    expect(curve.points[1]).toBe(DEFAULT_CTR_CURVE[1]); // no data at position 2 → generic
  });

  it('ignores branded and low-impression queries', () => {
    const rows = [
      ...Array.from({ length: 5 }, (_, i) => q(`example outdoors ${i}`, 500, 1000, 1)),
      ...Array.from({ length: 5 }, (_, i) => q(`rare ${i}`, 5, 10, 1)),
    ];
    const curve = buildCtrCurve(rows, settings, ['example outdoors']);
    expect(curve.source).toBe('default');
  });

  it('never expects a worse position to beat a better one', () => {
    const rows = Array.from({ length: 5 }, (_, i) => q(`q${i}`, 400, 1000, 6)); // 40% at position 6
    const curve = buildCtrCurve(rows, settings, []);
    for (let i = 1; i < curve.points.length; i++) expect(curve.points[i]!).toBeLessThanOrEqual(curve.points[i - 1]!);
  });
});
