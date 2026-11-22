import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../src/config.js';
import { findStrikingDistance } from '../src/diagnostics/striking.js';
import { FLAT_CURVE, period, q, qp, url } from './fixtures.js';

const t = DEFAULT_CONFIG.thresholds.striking; // positions 4–20, ≥100 impressions, target 3

describe('findStrikingDistance', () => {
  const data = period({
    queries: [
      q('trail shoes', 20, 1000, 7.5), // ✓ 2% CTR at 7.5
      q('rare query', 5, 50, 8), // too few impressions
      q('already top', 100, 1000, 2), // above the window
      q('page three', 1, 500, 25), // below the window
      q('beats target ctr', 150, 1000, 5), // no upside
      q('tent guide', 10, 2000, 12), // ✓ bigger upside
    ],
    queryPages: [qp('trail shoes', '/a/', 2, 100, 9), qp('trail shoes', '/b/', 18, 900, 7)],
  });

  const findings = findStrikingDistance(data, FLAT_CURVE, t);

  it('keeps only queries inside the position window with enough impressions and upside', () => {
    expect(findings.map((f) => f.query)).toEqual(['tent guide', 'trail shoes']);
  });

  it('estimates the upside at the target position', () => {
    const tent = findings[0]!;
    expect(tent.expectedCtrAtTarget).toBeCloseTo(0.1);
    expect(tent.potentialClicks).toBeCloseTo(2000 * (0.1 - 0.005));
    expect(findings[1]!.potentialClicks).toBeCloseTo(1000 * (0.1 - 0.02));
  });

  it('links each query to the page with most impressions', () => {
    expect(findings[1]!.page).toBe(url('/b/'));
    expect(findings[0]!.page).toBeUndefined();
  });

  it('respects custom thresholds', () => {
    const strict = findStrikingDistance(data, FLAT_CURVE, { ...t, minImpressions: 1500 });
    expect(strict.map((f) => f.query)).toEqual(['tent guide']);
  });
});
