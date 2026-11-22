import { formatInt, formatPct, formatPosition, formatSignedInt, formatSignedPct, shortUrl } from '../format.js';
import { pctChange } from '../metrics.js';
import type { Action, CannibalizationFinding, LosingFinding, LossCause, LowCtrFinding, Metrics, StrikingDistanceFinding } from '../types.js';

export const CAUSE_LABEL: Record<LossCause, string> = {
  disappeared: 'disappeared from search',
  'ranking-drop': 'ranking drop',
  'ctr-drop': 'CTR drop',
  'demand-drop': 'demand drop',
  mixed: 'mixed causes',
};

function trendWord(change: number): string {
  if (Math.abs(change) < 0.005) return 'held steady';
  return change > 0 ? 'rose' : 'fell';
}

function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

export interface SummaryInput {
  totals: { current: Metrics; previous: Metrics };
  days: number;
  striking: StrikingDistanceFinding[];
  lowCtr: LowCtrFinding[];
  losingPages: LosingFinding[];
  cannibalization: CannibalizationFinding[];
  actions: Action[];
}

/** A short, deterministic executive summary (no AI involved). */
export function buildSummary(input: SummaryInput): string[] {
  const { current, previous } = input.totals;
  const lines: string[] = [];
  const clickChange = pctChange(current.clicks, previous.clicks);
  const impressionChange = pctChange(current.impressions, previous.impressions);

  lines.push(
    `Clicks ${trendWord(clickChange)} ${Number.isFinite(clickChange) && Math.abs(clickChange) >= 0.005 ? `${formatPct(Math.abs(clickChange), 0)} ` : ''}` +
      `(${formatInt(current.clicks)} vs ${formatInt(previous.clicks)}) in the last ${input.days} days compared with the ${input.days} days before; ` +
      `impressions ${formatSignedPct(impressionChange)}, average position ${formatPosition(previous.position)} → ${formatPosition(current.position)}.`,
  );

  const worst = input.losingPages[0];
  if (worst) {
    lines.push(
      worst.cause === 'disappeared'
        ? `The biggest loss is ${shortUrl(worst.key)} (${formatSignedInt(worst.clickDelta)} clicks), which disappeared from search.`
        : `The biggest loss is ${shortUrl(worst.key)} (${formatSignedInt(worst.clickDelta)} clicks), most likely a ${CAUSE_LABEL[worst.cause]}.`,
    );
  }

  if (input.striking.length > 0) {
    const top = input.striking.slice(0, 10);
    const target = input.striking[0]!.targetPosition;
    const subject =
      input.striking.length === 1
        ? '1 query sits in striking distance; moving it'
        : input.striking.length <= 10
          ? `${input.striking.length} queries sit in striking distance; moving them`
          : `${input.striking.length} queries sit in striking distance; moving the top 10`;
    lines.push(
      `${subject} into the top ${target} could add ≈${formatInt(sum(top.map((f) => f.potentialClicks)))} clicks per ${input.days} days.`,
    );
  }

  if (input.lowCtr.length > 0) {
    lines.push(
      `${input.lowCtr.length} ${input.lowCtr.length === 1 ? 'page gets' : 'pages get'} fewer clicks than ${input.lowCtr.length === 1 ? 'its rankings deserve' : 'their rankings deserve'}; ` +
        `better titles and descriptions could recover ≈${formatInt(sum(input.lowCtr.map((f) => f.potentialClicks)))} clicks.`,
    );
  }

  if (input.cannibalization.length > 0) {
    const pages = new Set(input.cannibalization.flatMap((f) => f.pages.map((p) => p.page)));
    lines.push(
      `${input.cannibalization.length} ${input.cannibalization.length === 1 ? 'query is' : 'queries are'} split across ${pages.size} competing pages (keyword cannibalization).`,
    );
  }

  const first = input.actions[0];
  if (first) lines.push(`Start with: ${first.title}.`);
  else lines.push('No issues crossed the thresholds — nice work. Lower the thresholds in gsc-doctor.config.json to dig deeper.');

  return lines;
}
