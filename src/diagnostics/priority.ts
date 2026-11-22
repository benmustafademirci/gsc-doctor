import { formatInt, formatPct, formatPosition, formatSignedPct, shortUrl } from '../format.js';
import type {
  Action,
  CannibalizationFinding,
  Effort,
  LosingFinding,
  LossCause,
  LowCtrFinding,
  Priority,
  StrikingDistanceFinding,
} from '../types.js';

/**
 * Prioritisation model (documented in the README):
 *   score = estimated clicks per period × confidence ÷ effort weight
 * Confidence reflects how reliably the fix recovers the estimate (a title
 * rewrite is more predictable than climbing three positions); effort weights
 * are low = 1, medium = 2, high = 3.
 */
export const EFFORT_WEIGHT: Record<Effort, number> = { low: 1, medium: 2, high: 3 };

export const CONFIDENCE = {
  lowCtr: 0.7,
  striking: 0.5,
  cannibalization: 0.4,
  /** Losing queries usually overlap a losing page, so they count a bit less. */
  queryLossFactor: 0.6,
} as const;

/** A decrease as a positive percentage: -0.6 → "60%". */
const formatDrop = (fraction: number) => formatPct(Math.abs(fraction), 0);

const LOSS_PLAYBOOK: Record<LossCause, { effort: Effort; confidence: number }> = {
  disappeared: { effort: 'low', confidence: 0.8 },
  'ranking-drop': { effort: 'medium', confidence: 0.6 },
  'ctr-drop': { effort: 'low', confidence: 0.5 },
  'demand-drop': { effort: 'low', confidence: 0.1 },
  mixed: { effort: 'medium', confidence: 0.4 },
};

/** Share of the top score needed for "high" and "medium" priority. */
const PRIORITY_CUTOFFS = { high: 0.4, medium: 0.15 } as const;

type Draft = Omit<Action, 'score' | 'priority'>;

function strikingAction(f: StrikingDistanceFinding, i: number): Draft {
  return {
    id: `striking-${i}`,
    type: 'striking-distance',
    title: `Push “${f.query}” from position ${formatPosition(f.position)} into the top ${f.targetPosition}`,
    detail:
      `${formatInt(f.impressions)} impressions at ${formatPct(f.ctr)} CTR. ` +
      `${f.page ? `Strengthen ${shortUrl(f.page)}: ` : ''}cover the query's intent more completely, ` +
      `add internal links using this phrase, and improve the page's title for it.`,
    target: f.query,
    estimatedClicks: f.potentialClicks,
    effort: 'medium',
    confidence: CONFIDENCE.striking,
  };
}

function lowCtrAction(f: LowCtrFinding, i: number, ctrLoss?: LosingFinding): Draft {
  const trend = ctrLoss ? `CTR also fell ${formatDrop(ctrLoss.ctrDeltaPct)} since the previous period. ` : '';
  return {
    id: `low-ctr-${i}`,
    type: 'low-ctr',
    title: `Rewrite the title and meta description of ${shortUrl(f.page)}`,
    detail:
      `CTR is ${formatPct(f.ctr)} where ${formatPct(f.expectedCtr)} is expected at average position ` +
      `${formatPosition(f.position)} (${formatInt(f.impressions)} impressions). ${trend}` +
      `Lead with the main query, state the benefit, and make the snippet stand out.`,
    target: f.page,
    estimatedClicks: f.potentialClicks,
    effort: 'low',
    confidence: CONFIDENCE.lowCtr,
  };
}

function lossTitle(f: LosingFinding): string {
  const name = f.kind === 'page' ? shortUrl(f.key) : `“${f.key}”`;
  switch (f.cause) {
    case 'disappeared':
      return `Find out why ${name} vanished from search`;
    case 'ranking-drop':
      return `Recover rankings for ${name}`;
    case 'ctr-drop':
      return `Win back clicks on ${name}`;
    case 'demand-drop':
      return `Check demand for ${name}`;
    case 'mixed':
      return `Investigate the traffic loss on ${name}`;
  }
}

function lossDetail(f: LosingFinding): string {
  const lost = `${formatInt(-f.clickDelta)} fewer clicks (${formatSignedPct(f.clickDeltaPct)}).`;
  switch (f.cause) {
    case 'disappeared':
      return `${lost} No impressions this period: check for a removal, redirect, noindex, canonical change or crawl error with URL Inspection.`;
    case 'ranking-drop':
      return `${lost} Average position fell from ${formatPosition(f.previous.position)} to ${formatPosition(f.current.position)}. Compare with the pages that now outrank you, then refresh the content and internal links.`;
    case 'ctr-drop':
      return `${lost} Ranking and impressions held but CTR fell ${formatDrop(f.ctrDeltaPct)}. Check the results page for new AI answers, rich results or ads, and test a stronger title.`;
    case 'demand-drop':
      return `${lost} Impressions fell ${formatDrop(f.impressionDeltaPct)} at a steady ranking — likely seasonality or fewer searches. Confirm with Google Trends before changing the page.`;
    case 'mixed':
      return `${lost} Impressions ${formatSignedPct(f.impressionDeltaPct)}, CTR ${formatSignedPct(f.ctrDeltaPct)}, position ${formatPosition(f.previous.position)} → ${formatPosition(f.current.position)}. Review which queries dropped.`;
  }
}

function lossAction(f: LosingFinding, i: number): Draft {
  const playbook = LOSS_PLAYBOOK[f.cause];
  return {
    id: `losing-${f.kind}-${i}`,
    type: f.kind === 'page' ? 'losing-page' : 'losing-query',
    title: lossTitle(f),
    detail: lossDetail(f),
    target: f.key,
    estimatedClicks: -f.clickDelta,
    effort: playbook.effort,
    confidence: f.kind === 'page' ? playbook.confidence : playbook.confidence * CONFIDENCE.queryLossFactor,
  };
}

function cannibalizationAction(f: CannibalizationFinding, i: number): Draft {
  const others = f.pages.filter((p) => p.page !== f.primaryPage).map((p) => shortUrl(p.page));
  return {
    id: `cannibalization-${i}`,
    type: 'cannibalization',
    title: `Stop ${f.pages.length} pages competing for “${f.query}”`,
    detail:
      `Make ${shortUrl(f.primaryPage)} the one page for this query: merge or differentiate ` +
      `${others.join(', ')}, and point internal links with this phrase to the main page.`,
    target: f.query,
    estimatedClicks: f.potentialClicks,
    effort: 'high',
    confidence: CONFIDENCE.cannibalization,
  };
}

export interface PriorityInput {
  striking: StrikingDistanceFinding[];
  lowCtr: LowCtrFinding[];
  losingPages: LosingFinding[];
  losingQueries: LosingFinding[];
  cannibalization: CannibalizationFinding[];
}

export function prioritize(input: PriorityInput): Action[] {
  // Avoid telling the user the same thing twice:
  // - a page with low CTR *and* a CTR-driven loss gets one "rewrite the snippet" action;
  // - a losing query whose page already has a loss action is covered by that action.
  const lowCtrPages = new Set(input.lowCtr.map((f) => f.page));
  const ctrLossByPage = new Map(
    input.losingPages.filter((f) => f.cause === 'ctr-drop' && lowCtrPages.has(f.key)).map((f) => [f.key, f]),
  );
  const losingPageKeys = new Set(input.losingPages.map((f) => f.key));

  const drafts: Draft[] = [
    ...input.lowCtr.map((f, i) => lowCtrAction(f, i, ctrLossByPage.get(f.page))),
    ...input.striking.map(strikingAction),
    ...input.losingPages.filter((f) => !ctrLossByPage.has(f.key)).map(lossAction),
    ...input.losingQueries.filter((f) => !(f.page && losingPageKeys.has(f.page))).map(lossAction),
    ...input.cannibalization.map(cannibalizationAction),
  ];

  const scored = drafts
    .map((d) => ({ ...d, score: (d.estimatedClicks * d.confidence) / EFFORT_WEIGHT[d.effort] }))
    .filter((a) => a.score > 0)
    .sort((a, b) => b.score - a.score || b.estimatedClicks - a.estimatedClicks);

  const top = scored[0]?.score ?? 0;
  return scored.map((a): Action => {
    const ratio = top > 0 ? a.score / top : 0;
    const priority: Priority = ratio >= PRIORITY_CUTOFFS.high ? 'high' : ratio >= PRIORITY_CUTOFFS.medium ? 'medium' : 'low';
    return { ...a, priority };
  });
}
