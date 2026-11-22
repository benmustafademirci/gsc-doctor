import { describe, expect, it } from 'vitest';
import { CONFIDENCE, EFFORT_WEIGHT, prioritize } from '../src/diagnostics/priority.js';
import type { LosingFinding, LowCtrFinding, StrikingDistanceFinding } from '../src/types.js';
import { url } from './fixtures.js';

const striking = (query: string, potentialClicks: number): StrikingDistanceFinding => ({
  query,
  page: url('/guide/'),
  clicks: 10,
  impressions: 1000,
  ctr: 0.01,
  position: 8,
  targetPosition: 3,
  expectedCtrAtTarget: 0.1,
  potentialClicks,
});

const lowCtr = (path: string, potentialClicks: number): LowCtrFinding => ({
  page: url(path),
  clicks: 10,
  impressions: 1000,
  ctr: 0.01,
  position: 2,
  expectedCtr: 0.15,
  ctrRatio: 0.07,
  potentialClicks,
  basis: 'queries',
  topQueries: [],
});

const loss = (kind: 'page' | 'query', key: string, cause: LosingFinding['cause'], clickDelta: number, page?: string): LosingFinding => ({
  kind,
  key,
  page,
  current: { clicks: 100 + clickDelta, impressions: 1000, ctr: 0.05, position: 3 },
  previous: { clicks: 100, impressions: 1000, ctr: 0.1, position: 3 },
  clickDelta,
  clickDeltaPct: clickDelta / 100,
  impressionDeltaPct: 0,
  ctrDeltaPct: -0.5,
  positionDelta: 0,
  cause,
  volumeEffect: 0,
  ctrEffect: clickDelta,
});

const empty = { striking: [], lowCtr: [], losingPages: [], losingQueries: [], cannibalization: [] };

describe('prioritize', () => {
  it('scores = estimated clicks × confidence ÷ effort', () => {
    const [snippet, push] = prioritize({ ...empty, striking: [striking('trail shoes', 100)], lowCtr: [lowCtr('/weak/', 100)] });
    expect(snippet!.type).toBe('low-ctr');
    expect(snippet!.score).toBeCloseTo((100 * CONFIDENCE.lowCtr) / EFFORT_WEIGHT.low);
    expect(push!.score).toBeCloseTo((100 * CONFIDENCE.striking) / EFFORT_WEIGHT.medium);
  });

  it('assigns priority tiers relative to the top item', () => {
    const actions = prioritize({ ...empty, striking: [striking('a', 1000), striking('b', 300), striking('c', 50)] });
    expect(actions.map((a) => a.priority)).toEqual(['high', 'medium', 'low']);
  });

  it('merges a CTR-driven loss into the matching snippet action', () => {
    const actions = prioritize({
      ...empty,
      lowCtr: [lowCtr('/weak/', 120)],
      losingPages: [loss('page', url('/weak/'), 'ctr-drop', -80)],
    });
    expect(actions).toHaveLength(1);
    expect(actions[0]!.type).toBe('low-ctr');
    expect(actions[0]!.detail).toContain('CTR also fell 50%');
  });

  it('does not repeat a losing query whose page already has an action', () => {
    const actions = prioritize({
      ...empty,
      losingPages: [loss('page', url('/gone/'), 'disappeared', -100)],
      losingQueries: [loss('query', 'gps watch', 'disappeared', -60, url('/gone/')), loss('query', 'other', 'ranking-drop', -40, url('/x/'))],
    });
    expect(actions.map((a) => a.target)).toEqual([url('/gone/'), 'other']);
  });

  it('drops items with no estimated upside', () => {
    expect(prioritize({ ...empty, striking: [striking('nothing', 0)] })).toEqual([]);
  });
});
