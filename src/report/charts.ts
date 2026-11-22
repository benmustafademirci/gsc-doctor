/**
 * Hand-rolled inline SVG charts — no chart library, no CDN, no network.
 * Colors come from CSS custom properties defined in styles.ts, so light and
 * dark themes swap in one place. Every value shown here is also in a table.
 */
import { expectedCtr } from '../ctr.js';
import { formatCompact, formatInt, formatPct, formatPosition, shortUrl } from '../format.js';
import type { DailyRow } from '../types.js';
import { escapeHtml, jsonForScript, tip } from './escape.js';

const dayFormat = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
export function shortDate(iso: string): string {
  return dayFormat.format(new Date(`${iso}T00:00:00Z`));
}

/** A "nice" axis maximum and evenly spaced ticks (1/2/2.5/5 × 10^n steps). */
export function niceTicks(max: number, count = 4): number[] {
  if (!(max > 0)) return [0, 1];
  const rough = max / count;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= rough) ?? rough;
  const ticks: number[] = [];
  for (let v = 0; v <= max + step * 0.999; v += step) ticks.push(Number(v.toFixed(10)));
  return ticks;
}

const f1 = (n: number) => n.toFixed(1);

function polyline(points: Array<[number, number]>): string {
  return points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${f1(x)},${f1(y)}`).join('');
}

export interface TrendChartInput {
  id: string;
  metric: 'clicks' | 'impressions';
  current: DailyRow[];
  previous: DailyRow[];
  days: number;
}

/** Current period vs previous period, aligned by day, with a crosshair layer. */
export function trendChart({ id, metric, current, previous, days }: TrendChartInput): string {
  const W = 960;
  const H = 280;
  const m = { top: 20, right: 24, bottom: 34, left: 56 };
  const cur = current.map((d) => d[metric]);
  const prev = previous.map((d) => d[metric]);
  const n = Math.max(cur.length, prev.length, 2);
  const ticks = niceTicks(Math.max(...cur, ...prev, 1));
  const yMax = ticks[ticks.length - 1]!;
  const x = (i: number) => m.left + (i / (n - 1)) * (W - m.left - m.right);
  const y = (v: number) => H - m.bottom - (v / yMax) * (H - m.top - m.bottom);

  const grid = ticks
    .map(
      (t) =>
        `<line class="grid" x1="${m.left}" x2="${W - m.right}" y1="${f1(y(t))}" y2="${f1(y(t))}"/>` +
        `<text class="tick" x="${m.left - 8}" y="${f1(y(t) + 4)}" text-anchor="end">${formatCompact(t)}</text>`,
    )
    .join('');
  const xTicks = current
    .map((d, i) => ({ d, i }))
    .filter(({ i }) => i % 7 === 0 || i === current.length - 1)
    .map(({ d, i }) => `<text class="tick" x="${f1(x(i))}" y="${H - 10}" text-anchor="middle">${shortDate(d.date)}</text>`)
    .join('');

  const curPts = cur.map((v, i) => [x(i), y(v)] as [number, number]);
  const prevPts = prev.map((v, i) => [x(i), y(v)] as [number, number]);
  const area = curPts.length
    ? `${polyline(curPts)}L${f1(curPts[curPts.length - 1]![0])},${f1(y(0))}L${f1(curPts[0]![0])},${f1(y(0))}Z`
    : '';
  const last = curPts[curPts.length - 1];
  const lastPrev = prevPts[prevPts.length - 1];

  const data = {
    metric,
    left: m.left,
    right: W - m.right,
    width: W,
    n,
    current: current.map((d) => [d.date, d[metric]]),
    previous: previous.map((d) => [d.date, d[metric]]),
    yTop: m.top,
    yBottom: H - m.bottom,
  };
  const label = `${metric === 'clicks' ? 'Clicks' : 'Impressions'} per day: last ${days} days vs previous ${days} days`;

  return `<figure class="chart trend" data-trend="${escapeHtml(id)}">
<div class="legend"><span class="lkey line s-cur"></span>Last ${days} days<span class="lkey line s-prev"></span>Previous ${days} days</div>
<div class="chart-scroll"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${escapeHtml(label)}">
${grid}
<line class="axis" x1="${m.left}" x2="${W - m.right}" y1="${f1(y(0))}" y2="${f1(y(0))}"/>
${xTicks}
<path class="area s-cur" d="${area}"/>
<path class="line s-prev" d="${polyline(prevPts)}"/>
<path class="line s-cur" d="${polyline(curPts)}"/>
${lastPrev ? `<circle class="dot s-prev" cx="${f1(lastPrev[0])}" cy="${f1(lastPrev[1])}" r="4"/>` : ''}
${last ? `<circle class="dot s-cur" cx="${f1(last[0])}" cy="${f1(last[1])}" r="4"/>` : ''}
<line class="crosshair" x1="0" x2="0" y1="${m.top}" y2="${H - m.bottom}" visibility="hidden"/>
<rect class="hit" x="${m.left}" y="${m.top}" width="${W - m.left - m.right}" height="${H - m.top - m.bottom}" fill="transparent"/>
</svg></div>
<script type="application/json" class="trend-data">${jsonForScript(data)}</script>
</figure>`;
}

/** 2-period sparkline for a stat tile: previous period muted, current period in the accent. */
export function sparkline(values: number[], splitIndex: number, invert = false): string {
  const W = 220;
  const H = 44;
  const pad = 4;
  if (values.length < 2) return '';
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const x = (i: number) => pad + (i / (values.length - 1)) * (W - pad * 2);
  const y = (v: number) => {
    const t = (v - min) / span;
    return pad + (invert ? t : 1 - t) * (H - pad * 2);
  };
  const pts = values.map((v, i) => [x(i), y(v)] as [number, number]);
  const prev = pts.slice(0, splitIndex + 1);
  const cur = pts.slice(splitIndex);
  const end = pts[pts.length - 1]!;
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" aria-hidden="true" preserveAspectRatio="none">
<path class="line s-prev thin" d="${polyline(prev)}"/><path class="line s-cur thin" d="${polyline(cur)}"/>
<circle class="dot s-cur" cx="${f1(end[0])}" cy="${f1(end[1])}" r="3"/></svg>`;
}

export interface CurveDot {
  page: string;
  position: number;
  ctr: number;
  expectedCtr: number;
  impressions: number;
  /** 1-based row number in the low-CTR table, if flagged. */
  flagged?: number;
}

/** The site's learned CTR curve vs the generic one, with pages plotted against it. */
export function ctrCurveChart(siteCurve: readonly number[], genericCurve: readonly number[], dots: CurveDot[], maxPosition: number, siteCurveIsLearned: boolean): string {
  const W = 960;
  const H = 320;
  const m = { top: 20, right: 24, bottom: 40, left: 56 };
  const xMax = Math.max(10, Math.ceil(maxPosition));
  const flaggedMax = Math.max(0, ...dots.filter((d) => d.flagged).map((d) => d.ctr));
  const ticks = niceTicks(Math.max(siteCurve[0] ?? 0.3, genericCurve[0] ?? 0.3, flaggedMax) * 1.05, 5);
  const yMax = ticks[ticks.length - 1]!;
  const x = (p: number) => m.left + ((p - 1) / (xMax - 1)) * (W - m.left - m.right);
  const y = (v: number) => H - m.bottom - (Math.min(v, yMax) / yMax) * (H - m.top - m.bottom);
  const curvePts = (curve: readonly number[]) => {
    const pts: Array<[number, number]> = [];
    for (let p = 1; p <= xMax; p += 0.25) pts.push([x(p), y(expectedCtr(curve, p))]);
    return pts;
  };

  const grid = ticks
    .map(
      (t) =>
        `<line class="grid" x1="${m.left}" x2="${W - m.right}" y1="${f1(y(t))}" y2="${f1(y(t))}"/>` +
        `<text class="tick" x="${m.left - 8}" y="${f1(y(t) + 4)}" text-anchor="end">${formatPct(t, 0)}</text>`,
    )
    .join('');
  const xTicks = Array.from({ length: xMax }, (_, i) => i + 1)
    .map((p) => `<text class="tick" x="${f1(x(p))}" y="${H - 20}" text-anchor="middle">${p}</text>`)
    .join('');

  const visible = dots.filter((d) => d.position >= 1 && d.position <= xMax && d.ctr <= yMax);
  const others = visible.filter((d) => !d.flagged);
  const flagged = visible.filter((d) => d.flagged);
  const dotTip = (d: CurveDot) =>
    tip([
      shortUrl(d.page),
      `CTR ${formatPct(d.ctr)} · expected ${formatPct(d.expectedCtr)}`,
      `Avg. position ${formatPosition(d.position)} · ${formatInt(d.impressions)} impressions`,
    ]);

  return `<figure class="chart">
<div class="legend"><span class="lkey line s-cur"></span>${siteCurveIsLearned ? 'Your site’s CTR curve' : 'CTR curve used'}<span class="lkey line s-prev"></span>Generic curve<span class="lkey dot s-flag"></span>Flagged page<span class="lkey dot s-other"></span>Other pages</div>
<div class="chart-scroll"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Click-through rate by average position: expected curve and pages">
${grid}
<line class="axis" x1="${m.left}" x2="${W - m.right}" y1="${f1(y(0))}" y2="${f1(y(0))}"/>
${xTicks}
<text class="axis-title" x="${f1((m.left + W - m.right) / 2)}" y="${H - 2}" text-anchor="middle">Average position</text>
<path class="line s-prev" d="${polyline(curvePts(genericCurve))}"/>
<path class="line s-cur" d="${polyline(curvePts(siteCurve))}"/>
${others.map((d) => `<circle class="dot s-other" cx="${f1(x(d.position))}" cy="${f1(y(d.ctr))}" r="4" ${dotTip(d)}/>`).join('')}
${flagged
  .map(
    (d) =>
      `<g class="flag" ${dotTip(d)}><circle class="dot s-flag" cx="${f1(x(d.position))}" cy="${f1(y(d.ctr))}" r="6"/>` +
      `<text class="dot-label" x="${f1(x(d.position) + 10)}" y="${f1(y(d.ctr) + 4)}">${d.flagged}</text></g>`,
  )
  .join('')}
</svg></div>
</figure>`;
}

/** A 1–20 position track: where the query ranks now and the target zone. */
export function positionTrack(position: number, target: number, maxPosition = 20): string {
  const W = 150;
  const H = 18;
  const pad = 6;
  const x = (p: number) => pad + ((Math.min(Math.max(p, 1), maxPosition) - 1) / (maxPosition - 1)) * (W - pad * 2);
  return `<svg class="track" viewBox="0 0 ${W} ${H}" role="img" aria-label="Position ${formatPosition(position)}, target top ${target}">
<line class="track-line" x1="${pad}" x2="${W - pad}" y1="9" y2="9"/>
<rect class="track-goal" x="${f1(x(1) - 3)}" y="4" width="${f1(x(target) - x(1) + 6)}" height="10" rx="5"/>
<line class="track-gap" x1="${f1(x(target))}" x2="${f1(x(position))}" y1="9" y2="9"/>
<circle class="dot s-cur" cx="${f1(x(position))}" cy="9" r="4.5"/></svg>`;
}
