import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../src/config.js';
import { findCannibalization } from '../src/diagnostics/cannibalization.js';
import { FLAT_CURVE, period, qp, url } from './fixtures.js';

const t = DEFAULT_CONFIG.thresholds.cannibalization; // ≥100 impressions, each page ≥10%

describe('findCannibalization', () => {
  const data = period({
    queryPages: [
      qp('split query', '/a/', 30, 600, 5),
      qp('split query', '/b/', 10, 400, 7),
      qp('dominant query', '/a/', 50, 950, 3),
      qp('dominant query', '/c/', 0, 50, 30),
      qp('fragment query', '/g/', 10, 500, 4),
      qp('fragment query', '/g/#section', 10, 500, 4),
      qp('example outdoors', '/', 200, 600, 1),
      qp('example outdoors', '/about/', 50, 400, 2),
      qp('small query', '/a/', 1, 40, 8),
      qp('small query', '/b/', 1, 40, 9),
    ],
  });

  it('flags queries whose impressions are split across pages', () => {
    const findings = findCannibalization(data, FLAT_CURVE, t, ['example outdoors']);
    expect(findings.map((f) => f.query)).toEqual(['split query']);
    const [f] = findings;
    expect(f!.pages.map((x) => x.page)).toEqual([url('/a/'), url('/b/')]);
    expect(f!.pages.map((x) => x.share)).toEqual([0.6, 0.4]);
    expect(f!.primaryPage).toBe(url('/a/'));
    expect(f!.bestPosition).toBe(5);
    expect(f!.splitScore).toBeCloseTo(0.4);
    expect(f!.potentialClicks).toBeCloseTo(1000 * 0.06 - 40);
  });

  it('does not treat #fragment URLs as competing pages', () => {
    const findings = findCannibalization(data, FLAT_CURVE, t, []);
    expect(findings.some((f) => f.query === 'fragment query')).toBe(false);
  });

  it('can include brand queries on request', () => {
    const findings = findCannibalization(data, FLAT_CURVE, { ...t, includeBranded: true }, ['example outdoors']);
    expect(findings.map((f) => f.query)).toContain('example outdoors');
  });

  it('respects the share threshold', () => {
    const findings = findCannibalization(data, FLAT_CURVE, { ...t, minPageShare: 0.45 }, []);
    expect(findings.some((f) => f.query === 'split query')).toBe(false);
  });
});
