import type { Config } from '../config.js';
import { expectedCtr } from '../ctr.js';
import { eachDay } from '../dates.js';
import { CAUSE_LABEL } from '../diagnostics/summary.js';
import {
  formatCompact,
  formatInt,
  formatPct,
  formatPosition,
  formatSignedInt,
  formatSignedPct,
  shortUrl,
} from '../format.js';
import { pctChange } from '../metrics.js';
import type {
  Action,
  AiInsights,
  CannibalizationFinding,
  DateRange,
  Diagnosis,
  FindingType,
  LosingFinding,
  LowCtrFinding,
  Metrics,
  StrikingDistanceFinding,
  TitleSuggestion,
} from '../types.js';
import { ctrCurveChart, positionTrack, shortDate, sparkline, trendChart, type CurveDot } from './charts.js';
import { escapeHtml, safeHref, tip } from './escape.js';
import { SCRIPT } from './script.js';
import { STYLES } from './styles.js';

export interface RenderOptions {
  version: string;
  config: Config;
  ai?: AiInsights;
  /** Shown when Gemini was attempted but failed. */
  aiError?: string;
  /** Whether a Gemini key was available (controls the hint text). */
  aiConfigured?: boolean;
}

const REPO_URL = 'https://github.com/benmustafademirci/gsc-doctor';
/** Hard cap on rows per table so huge sites still produce a light file. */
const MAX_TABLE_ROWS = 200;
const VISIBLE_ACTIONS = 12;
const MAX_ACTIONS = 50;

const TYPE_LABEL: Record<FindingType, string> = {
  'striking-distance': 'Striking distance',
  'low-ctr': 'Title & snippet',
  'losing-page': 'Traffic loss',
  'losing-query': 'Traffic loss',
  cannibalization: 'Cannibalization',
};

const e = escapeHtml;

export function siteLabel(siteUrl: string): string {
  if (siteUrl.startsWith('sc-domain:')) return siteUrl.slice('sc-domain:'.length);
  try {
    const url = new URL(siteUrl);
    return `${url.host}${url.pathname === '/' ? '' : url.pathname}`;
  } catch {
    return siteUrl;
  }
}

const yearFormat = new Intl.DateTimeFormat('en-US', { year: 'numeric', timeZone: 'UTC' });
function rangeLabel(range: DateRange): string {
  const year = yearFormat.format(new Date(`${range.end}T00:00:00Z`));
  return `${shortDate(range.start)} – ${shortDate(range.end)}, ${year}`;
}

function link(url: string, text = shortUrl(url)): string {
  const href = safeHref(url);
  return href ? `<a href="${href}" target="_blank" rel="noopener noreferrer">${e(text)}</a>` : e(text);
}

/** Table rows with the first `visible` shown and the rest behind a disclosure. */
function rowsWithMore(rows: string[], header: string, visible: number, total: number, noun: string): string {
  const shown = rows.slice(0, visible);
  const hidden = rows.slice(visible, MAX_TABLE_ROWS);
  const table = (body: string[]) => `<div class="table-scroll"><table>${header}<tbody>${body.join('')}</tbody></table></div>`;
  let html = table(shown);
  if (hidden.length > 0) {
    html += `<details class="more"><summary>Show ${hidden.length} more ${noun}</summary>${table(hidden)}</details>`;
  }
  if (total > MAX_TABLE_ROWS) {
    html += `<p class="small muted" style="padding:0 10px">${formatInt(total - MAX_TABLE_ROWS)} more not shown — use <code>--json</code> for the full list.</p>`;
  }
  return html;
}

// ---------------------------------------------------------------------------
// Header & stat tiles

function logo(): string {
  return `<svg viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="8" fill="var(--s-cur)"/><path d="M5 17h5l2.5-6 4 11 3-8 2 3H27" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

function deltaHtml(current: number, previous: number, kind: 'count' | 'ctr' | 'position', days: number): string {
  const vs = `<span class="vs"> vs previous ${days} days</span>`;
  if (kind === 'position') {
    const diff = current - previous;
    if (Math.abs(diff) < 0.05) return `<div class="delta flat">No change${vs}</div>`;
    const better = diff < 0;
    return `<div class="delta ${better ? 'up-good' : 'down-bad'}">${better ? '▲' : '▼'} ${Math.abs(diff).toFixed(1)} ${better ? 'better' : 'worse'}${vs}</div>`;
  }
  const change = pctChange(current, previous);
  if (!Number.isFinite(change)) return `<div class="delta up-good">New${vs}</div>`;
  if (Math.abs(change) < 0.005) return `<div class="delta flat">No change${vs}</div>`;
  const up = change > 0;
  return `<div class="delta ${up ? 'up-good' : 'down-bad'}">${up ? '▲' : '▼'} ${formatSignedPct(change).replace(/^[+−]/, '')}${vs}</div>`;
}

function statTiles(d: Diagnosis, days: number): string {
  const { current, previous } = d.totals;
  const prevDays = d.daily.filter((x) => x.date >= d.previous.start && x.date <= d.previous.end);
  const curDays = d.daily.filter((x) => x.date >= d.current.start && x.date <= d.current.end);
  const series = [...prevDays, ...curDays];
  const split = Math.max(0, prevDays.length - 1);
  const tile = (label: string, value: string, delta: string, values: number[], invert = false) =>
    `<div class="kpi"><div class="label">${label}</div><div class="value">${value}</div>${delta}${sparkline(values, split, invert)}</div>`;
  return `<div class="kpis">
${tile('Clicks', formatCompact(current.clicks), deltaHtml(current.clicks, previous.clicks, 'count', days), series.map((x) => x.clicks))}
${tile('Impressions', formatCompact(current.impressions), deltaHtml(current.impressions, previous.impressions, 'count', days), series.map((x) => x.impressions))}
${tile('Average CTR', formatPct(current.ctr), deltaHtml(current.ctr, previous.ctr, 'ctr', days), series.map((x) => x.ctr))}
${tile('Average position', formatPosition(current.position), deltaHtml(current.position, previous.position, 'position', days), series.map((x) => x.position), true)}
</div>`;
}

function trendSection(d: Diagnosis, days: number): string {
  const current = d.daily.filter((x) => x.date >= d.current.start && x.date <= d.current.end);
  const previous = d.daily.filter((x) => x.date >= d.previous.start && x.date <= d.previous.end);
  const tableRows = current
    .map((c, i) => {
      const p = previous[i];
      return `<tr><td>${e(c.date)}</td><td class="num">${formatInt(c.clicks)}</td><td class="num">${formatInt(c.impressions)}</td><td>${p ? e(p.date) : ''}</td><td class="num">${p ? formatInt(p.clicks) : ''}</td><td class="num">${p ? formatInt(p.impressions) : ''}</td></tr>`;
    })
    .join('');
  return `<div class="card" style="margin-top:12px">
<input class="tab-input" type="radio" name="trend" id="tab-clicks" checked>
<input class="tab-input" type="radio" name="trend" id="tab-impressions">
<div class="tabs" role="tablist"><label for="tab-clicks">Clicks</label><label for="tab-impressions">Impressions</label></div>
<div class="tab-panel panel-clicks">${trendChart({ id: 'clicks', metric: 'clicks', current, previous, days })}</div>
<div class="tab-panel panel-impressions">${trendChart({ id: 'impressions', metric: 'impressions', current, previous, days })}</div>
<details class="more"><summary>Daily numbers</summary><div class="table-scroll"><table><thead><tr><th>Date</th><th class="num">Clicks</th><th class="num">Impressions</th><th>Previous date</th><th class="num">Clicks</th><th class="num">Impressions</th></tr></thead><tbody>${tableRows}</tbody></table></div></details>
</div>`;
}

// ---------------------------------------------------------------------------
// Summary, AI and actions

function summarySection(d: Diagnosis, opts: RenderOptions): string {
  const diagnosis = `<div class="card"><h3>Diagnosis</h3><ul class="summary-list">${d.summary.map((s) => `<li>${e(s)}</li>`).join('')}</ul></div>`;
  let ai: string;
  if (opts.ai) {
    const tag = opts.ai.sample ? 'Sample output' : `Gemini · ${e(opts.ai.model)}`;
    ai = `<div class="card ai-card"><h3>In plain words <span class="tag">${tag}</span></h3>
<p>${e(opts.ai.summary)}</p>
${opts.ai.highlights.length ? `<ul class="summary-list">${opts.ai.highlights.map((h) => `<li>${e(h)}</li>`).join('')}</ul>` : ''}
${opts.ai.sample ? `<div class="hint">This is a hand-written example of what the AI layer adds. Set <code>GEMINI_API_KEY</code> to have Gemini write it for your own data.</div>` : `<div class="hint">AI-written from the diagnostics above. Check facts before sending to a client.</div>`}
</div>`;
  } else {
    const reason = opts.aiError
      ? `Gemini could not be reached (${e(opts.aiError)}). The diagnostics above are complete without it.`
      : opts.aiConfigured
        ? 'AI summary was skipped (<code>--no-ai</code>).'
        : 'Set <code>GEMINI_API_KEY</code> to add a plain-language summary and new title/description ideas written by Gemini. Everything else works without it.';
    ai = `<div class="card ai-card"><h3>In plain words</h3><div class="hint" style="margin-top:0">${reason}</div></div>`;
  }
  return `<div class="grid-2">${diagnosis}${ai}</div>`;
}

function actionItem(a: Action, rank: number, days: number): string {
  const verb = a.type === 'losing-page' || a.type === 'losing-query' ? 'clicks lost' : 'potential clicks';
  return `<li>
<div class="rank">${rank}</div>
<div><div class="badges"><span class="badge ${a.priority}">${a.priority === 'high' ? 'High' : a.priority === 'medium' ? 'Medium' : 'Low'} priority</span><span class="chip">${TYPE_LABEL[a.type]}</span><span class="chip">Effort: ${a.effort}</span></div>
<div class="title">${e(a.title)}</div><div class="detail">${e(a.detail)}</div></div>
<div class="gain"><strong>${a.type.startsWith('losing') ? '' : '+'}${formatInt(a.estimatedClicks)}</strong><span>${verb} / ${days} days</span></div>
</li>`;
}

function actionsSection(d: Diagnosis, days: number): string {
  if (d.actions.length === 0) return `<div class="card empty">Nothing crossed the thresholds. Lower them in <code>gsc-doctor.config.json</code> to dig deeper.</div>`;
  const list = d.actions.slice(0, MAX_ACTIONS);
  const visible = list.slice(0, VISIBLE_ACTIONS).map((a, i) => actionItem(a, i + 1, days));
  const hidden = list.slice(VISIBLE_ACTIONS).map((a, i) => actionItem(a, i + 1 + VISIBLE_ACTIONS, days));
  let html = `<ol class="actions">${visible.join('')}</ol>`;
  if (hidden.length) html += `<details class="more"><summary>Show ${hidden.length} more actions</summary><ol class="actions">${hidden.join('')}</ol></details>`;
  if (d.actions.length > MAX_ACTIONS) html += `<p class="small muted">${d.actions.length - MAX_ACTIONS} lower-priority items are listed in the sections below.</p>`;
  return html;
}

// ---------------------------------------------------------------------------
// Diagnostic sections

function meter(value: number, max: number): string {
  const pct = max > 0 ? Math.max(1, Math.min(100, (value / max) * 100)) : 0;
  return `<span class="meter" aria-hidden="true"><span style="width:${pct.toFixed(1)}%"></span></span>`;
}

function strikingSection(items: StrikingDistanceFinding[], config: Config, days: number): string {
  if (items.length === 0) return `<div class="card empty">No queries between positions ${config.thresholds.striking.minPosition} and ${config.thresholds.striking.maxPosition} with at least ${formatInt(config.thresholds.striking.minImpressions)} impressions.</div>`;
  const max = items[0]!.potentialClicks;
  const header = `<thead><tr><th>Query</th><th>Position</th><th class="num">Impressions</th><th class="num">Clicks</th><th class="num">CTR</th><th class="num">Potential / ${days} days</th></tr></thead>`;
  const rows = items.map(
    (f) => `<tr><td class="key">${e(f.query)}${f.page ? `<span class="sub">${link(f.page)}</span>` : ''}</td>
<td><span class="num">${formatPosition(f.position)}</span>${positionTrack(f.position, f.targetPosition)}</td>
<td class="num">${formatInt(f.impressions)}</td><td class="num">${formatInt(f.clicks)}</td><td class="num">${formatPct(f.ctr)}</td>
<td class="num"><strong>+${formatInt(f.potentialClicks)}</strong>${meter(f.potentialClicks, max)}</td></tr>`,
  );
  return `<div class="card table">${rowsWithMore(rows, header, config.maxRowsPerSection, items.length, 'queries')}</div>`;
}

function snippetBlock(page: string, d: Diagnosis, suggestion: TitleSuggestion | undefined, sample: boolean): string {
  const meta = d.pageMeta[page];
  const current = meta
    ? `<div><h4>Current snippet</h4><div class="serp-title">${meta.title ? e(meta.title) : '<span class="missing">No title found</span>'}</div><div class="serp-desc">${meta.description ? e(meta.description) : '<span class="missing">No meta description</span>'}</div></div>`
    : '';
  const suggested = suggestion
    ? `<div><h4>${sample ? 'Sample suggestions' : 'Suggested by Gemini'}</h4><ul>${suggestion.titles.map((t) => `<li class="serp-title">${e(t)}</li>`).join('')}</ul><div class="serp-desc">${e(suggestion.metaDescription)}</div>${suggestion.rationale ? `<div class="small muted" style="margin-top:4px">${e(suggestion.rationale)}</div>` : ''}</div>`
    : '';
  if (!current && !suggested) return '';
  return `<div class="snippet">${current}${suggested}</div>`;
}

function lowCtrSection(d: Diagnosis, items: LowCtrFinding[], opts: RenderOptions, days: number): string {
  const t = opts.config.thresholds.lowCtr;
  const flaggedIndex = new Map(items.map((f, i) => [f.page, i + 1]));
  const dots: CurveDot[] = d.pagePoints.map((p) => {
    const finding = items.find((f) => f.page === p.page);
    return finding
      ? { page: p.page, position: finding.position, ctr: finding.ctr, expectedCtr: finding.expectedCtr, impressions: finding.impressions, flagged: flaggedIndex.get(p.page) }
      : { page: p.page, position: p.position, ctr: p.ctr, expectedCtr: expectedCtr(d.ctrCurve.points, p.position), impressions: p.impressions };
  });
  for (const f of items) {
    if (!d.pagePoints.some((p) => p.page === f.page)) {
      dots.push({ page: f.page, position: f.position, ctr: f.ctr, expectedCtr: f.expectedCtr, impressions: f.impressions, flagged: flaggedIndex.get(f.page) });
    }
  }
  const curveNote =
    d.ctrCurve.source === 'site'
      ? `The blue curve is learned from your own non-brand queries (${d.ctrCurve.sitePositions} of 20 positions had enough data; the rest use the generic curve).`
      : 'Not enough data to learn your own CTR curve, so the generic curve is used.';
  const chart = `<div class="card">${ctrCurveChart(d.ctrCurve.points, d.defaultCurve, dots, Math.max(10, t.maxPosition), d.ctrCurve.source === 'site')}<p class="small muted" style="margin:8px 0 0">${e(curveNote)} Pages above the chart's range are doing well and are not drawn.</p></div>`;

  if (items.length === 0) return `${chart}<div class="card empty">No page in the top ${t.maxPosition} gets less than ${formatPct(t.maxCtrRatio, 0)} of its expected clicks.</div>`;

  const suggestions = new Map((opts.ai?.titleSuggestions ?? []).map((s) => [s.page, s]));
  const header = `<thead><tr><th class="num">#</th><th>Page</th><th class="num">Avg. position</th><th class="num">Impressions</th><th>CTR vs expected</th><th class="num">Potential / ${days} days</th></tr></thead>`;
  const rows = items.map((f, i) => {
    const max = Math.max(f.ctr, f.expectedCtr) || 1;
    const detail = `<tr class="row-detail"><td></td><td colspan="5">
<div class="small muted">Top queries${f.basis === 'page' ? ' (most queries are anonymized; estimate uses the page average position)' : ''}</div>
<div class="queries">${f.topQueries.map((q) => `<span class="chip">${e(q.query)} · ${formatPosition(q.position)}</span>`).join('') || '<span class="muted small">Not available</span>'}</div>
${snippetBlock(f.page, d, suggestions.get(f.page), !!opts.ai?.sample)}
</td></tr>`;
    return `<tr><td class="num"><strong>${i + 1}</strong></td><td class="key">${link(f.page)}</td>
<td class="num">${formatPosition(f.position)}</td><td class="num">${formatInt(f.impressions)}</td>
<td><span class="num">${formatPct(f.ctr)} / ${formatPct(f.expectedCtr)}</span><span class="ctrpair" ${tip([`Actual CTR ${formatPct(f.ctr)}`, `Expected ${formatPct(f.expectedCtr)} (${Math.round(f.ctrRatio * 100)}% of expected)`])}><span class="actual" style="width:${((f.ctr / max) * 100).toFixed(1)}%"></span><span class="expected" style="width:${((f.expectedCtr / max) * 100).toFixed(1)}%"></span></span></td>
<td class="num"><strong>+${formatInt(f.potentialClicks)}</strong></td></tr>${detail}`;
  });
  return `${chart}<div class="card table" style="margin-top:12px"><div class="legend-inline" style="padding:0 10px"><span><span class="sw" style="background:var(--s-flag)"></span>Actual CTR</span><span><span class="sw" style="background:var(--s-prev)"></span>Expected at this position</span></div>${rowsWithMore(rows, header, opts.config.maxRowsPerSection, items.length, 'pages')}</div>`;
}

function splitBar(f: LosingFinding, maxAbs: number): string {
  const GAP = 1.2;
  let neg = 0;
  let pos = 0;
  const parts: string[] = [];
  const effects: Array<['vol' | 'ctr', number]> = [
    ['vol', f.volumeEffect],
    ['ctr', f.ctrEffect],
  ];
  const negCount = effects.filter(([, v]) => v < 0 && Math.abs(v) / maxAbs * 50 >= 0.3).length;
  const posCount = effects.filter(([, v]) => v > 0 && Math.abs(v) / maxAbs * 50 >= 0.3).length;
  let negSeen = 0;
  let posSeen = 0;
  for (const [cls, v] of effects) {
    const w = (Math.abs(v) / maxAbs) * 50;
    if (w < 0.3) continue;
    if (v < 0) {
      negSeen++;
      const right = 50 - neg;
      parts.push(`<span class="${cls}${negSeen === negCount ? ' neg-out' : ''}" style="left:${(right - w).toFixed(2)}%;width:${w.toFixed(2)}%"></span>`);
      neg += w + GAP;
    } else {
      posSeen++;
      parts.push(`<span class="${cls}${posSeen === posCount ? ' pos-out' : ''}" style="left:${(50 + pos).toFixed(2)}%;width:${w.toFixed(2)}%"></span>`);
      pos += w + GAP;
    }
  }
  return `<span class="split" ${tip([`${formatSignedInt(f.clickDelta)} clicks`, `From impressions: ${formatSignedInt(f.volumeEffect)}`, `From CTR: ${formatSignedInt(f.ctrEffect)}`])}>${parts.join('')}</span>`;
}

function causeLabel(f: LosingFinding): string {
  const label = CAUSE_LABEL[f.cause];
  return `<span class="cause ${f.cause}">${e(label.charAt(0).toUpperCase() + label.slice(1))}</span>`;
}

function losersTable(items: LosingFinding[], config: Config, noun: string): string {
  if (items.length === 0) {
    const t = config.thresholds.losers;
    return `<div class="card empty">No ${noun} lost at least ${formatInt(t.minClickLoss)} clicks and ${formatPct(t.minClickLossPct, 0)} of their traffic.</div>`;
  }
  const maxAbs = Math.max(...items.map((f) => Math.abs(f.volumeEffect) + Math.abs(f.ctrEffect)), 1);
  const header = `<thead><tr><th>${noun === 'pages' ? 'Page' : 'Query'}</th><th class="num">Clicks</th><th class="num">Change</th><th>Likely cause</th><th>Why clicks changed</th><th class="num">Impr.</th><th class="num">CTR</th><th class="num">Position</th></tr></thead>`;
  const rows = items.map((f) => {
    const name = f.kind === 'page' ? link(f.key) : `${e(f.key)}${f.page ? `<span class="sub">${link(f.page)}</span>` : ''}`;
    const position = f.current.impressions > 0 ? `${formatPosition(f.previous.position)} → ${formatPosition(f.current.position)}` : `${formatPosition(f.previous.position)} → —`;
    return `<tr><td class="key">${name}</td><td class="num">${formatInt(f.previous.clicks)} → ${formatInt(f.current.clicks)}</td>
<td class="num"><strong>${formatSignedInt(f.clickDelta)}</strong><br><span class="small muted">${formatSignedPct(f.clickDeltaPct)}</span></td>
<td>${causeLabel(f)}</td><td>${splitBar(f, maxAbs)}</td>
<td class="num">${formatSignedPct(f.impressionDeltaPct)}</td><td class="num">${f.current.impressions > 0 ? formatSignedPct(f.ctrDeltaPct) : '—'}</td><td class="num">${position}</td></tr>`;
  });
  return `<div class="card table"><div class="legend-inline" style="padding:0 10px"><span><span class="sw vol"></span>Change from impressions</span><span><span class="sw ctr"></span>Change from CTR</span><span class="muted">Left of the line = lost clicks</span></div>${rowsWithMore(rows, header, config.maxRowsPerSection, items.length, noun)}</div>`;
}

function cannibalizationSection(items: CannibalizationFinding[], config: Config, days: number): string {
  if (items.length === 0) return `<div class="card empty">No query has two or more pages each holding ${formatPct(config.thresholds.cannibalization.minPageShare, 0)}+ of its impressions.</div>`;
  const cards = items.slice(0, config.maxRowsPerSection).map((f) => {
    const shown = f.pages.slice(0, 3);
    const rest = f.pages.slice(3);
    const otherShare = Math.max(0, 1 - shown.reduce((s, p) => s + p.share, 0));
    const blocks = [
      ...shown.map((p, i) => ({ cls: `c${i + 1}`, share: p.share, name: shortUrl(p.page), metrics: p as Metrics })),
      ...(otherShare > 0.005 ? [{ cls: 'c4', share: otherShare, name: rest.length ? `${rest.length} more competing + other pages` : 'Other pages', metrics: undefined }] : []),
    ];
    const printed = (share: number) => share >= 0.12;
    const bar = blocks
      .map(
        (b) =>
          `<span class="${b.cls}" style="flex:${b.share.toFixed(4)} 1 0" ${tip([b.name, `${formatPct(b.share, 0)} of impressions`, ...(b.metrics ? [`Position ${formatPosition(b.metrics.position)} · ${formatInt(b.metrics.clicks)} clicks`] : [])])}>${printed(b.share) ? formatPct(b.share, 0) : ''}</span>`,
      )
      .join('');
    const legend = blocks
      .map((b, i) => {
        const page = shown[i];
        const share = printed(b.share) ? '' : ` · ${formatPct(b.share, 0)}`;
        if (!page) return `<li><span class="sw ${b.cls}"></span><span class="page muted">${e(b.name)}</span><span class="stats">${share.replace(' · ', '')}</span></li>`;
        return `<li><span class="sw ${b.cls}"></span><span class="page">${link(page.page)}${page.page === f.primaryPage ? '<span class="primary">✓ keep as main page</span>' : ''}</span><span class="stats">pos ${formatPosition(page.position)} · ${formatInt(page.clicks)} ${Math.round(page.clicks) === 1 ? "click" : "clicks"} · ${formatInt(page.impressions)} impr.${share}</span></li>`;
      })
      .join('');
    return `<div class="card cannibal"><h3><span>“${e(f.query)}”</span><span class="stats">${formatInt(f.impressions)} impressions · ${formatInt(f.clicks)} clicks · best position ${formatPosition(f.bestPosition)}${f.potentialClicks >= 1 ? ` · +${formatInt(f.potentialClicks)} potential / ${days} days` : ''}</span></h3>
<div class="seg" role="img" aria-label="${e(`Impression share for ${f.query}: ${blocks.map((b) => `${b.name} ${formatPct(b.share, 0)}`).join(', ')}`)}">${bar}</div>
<ul class="legend-list">${legend}</ul></div>`;
  });
  const more = items.length > config.maxRowsPerSection ? `<p class="small muted">${items.length - config.maxRowsPerSection} more queries — use <code>--json</code> for the full list.</p>` : '';
  return cards.join('') + more;
}

function methodologySection(d: Diagnosis, opts: RenderOptions): string {
  const t = opts.config.thresholds;
  const brand = opts.config.brandTerms.length ? opts.config.brandTerms.map((b) => `“${e(b)}”`).join(', ') : 'none set (use <code>--brand</code>)';
  return `<div class="card method grid-2" style="display:grid">
<div><h3>Thresholds used</h3><dl>
<dt>Striking distance</dt><dd>positions ${t.striking.minPosition}–${t.striking.maxPosition}, ≥ ${formatInt(t.striking.minImpressions)} impressions, upside at position ${t.striking.targetPosition}</dd>
<dt>Low CTR</dt><dd>top ${t.lowCtr.maxPosition}, ≥ ${formatInt(t.lowCtr.minImpressions)} impressions, CTR &lt; ${formatPct(t.lowCtr.maxCtrRatio, 0)} of expected</dd>
<dt>Traffic loss</dt><dd>≥ ${formatInt(t.losers.minClickLoss)} clicks and ≥ ${formatPct(t.losers.minClickLossPct, 0)} lost; ranking drop ≥ ${t.losers.positionDrop} positions; demand / CTR drop ≥ ${formatPct(t.losers.demandDropPct, 0)} / ${formatPct(t.losers.ctrDropPct, 0)}</dd>
<dt>Cannibalization</dt><dd>≥ ${formatInt(t.cannibalization.minImpressions)} impressions, each page ≥ ${formatPct(t.cannibalization.minPageShare, 0)} share${t.cannibalization.includeBranded ? '' : ', brand queries excluded'}</dd>
<dt>CTR curve</dt><dd>${t.ctr.model === 'site' ? `learned from your data (≥ ${t.ctr.minQueriesPerPosition} queries with ≥ ${t.ctr.minImpressionsForCurve} impressions per position)` : 'generic curve only'}</dd>
<dt>Brand terms</dt><dd>${brand}</dd>
</dl><p>Override any value in <code>gsc-doctor.config.json</code>.</p></div>
<div><h3>How priorities are scored</h3>
<p><strong>score = estimated clicks × confidence ÷ effort</strong>. Confidence: title rewrite 0.7, striking distance 0.5, cannibalization 0.4, traffic loss 0.1–0.8 by cause. Effort weight: low 1, medium 2, high 3.</p>
<p>Estimates are directional, not promises: they assume your CTR at a new position matches the curve above. Search Console hides rare (anonymized) queries, so query-level numbers can be lower than page totals. “Jump to” URLs with a <code>#fragment</code> are merged into their page.</p>
<p>${d.source === 'demo' ? 'Data: synthetic demo data for a fictional site on example.com.' : `Data: Google Search Console API, ${e(d.searchType)} search, final (complete) days only, fetched ${e(d.fetchedAt.slice(0, 16).replace('T', ' '))} UTC.`}</p></div>
</div>`;
}

// ---------------------------------------------------------------------------

export function renderReport(d: Diagnosis, opts: RenderOptions): string {
  const days = eachDay(d.current).length;
  const site = siteLabel(d.siteUrl);
  const generated = new Date(d.generatedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
  const toc = [
    ['actions', 'To-do', d.actions.length],
    ['striking', 'Striking distance', d.striking.length],
    ['low-ctr', 'Low CTR', d.lowCtr.length],
    ['losers', 'Traffic losses', d.losingPages.length + d.losingQueries.length],
    ['cannibalization', 'Cannibalization', d.cannibalization.length],
    ['method', 'Method', undefined],
  ] as const;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="generator" content="gsc-doctor ${e(opts.version)}">
<title>SEO check-up · ${e(site)} · gsc-doctor</title>
<style>${STYLES}</style>
</head>
<body>
<div class="wrap">
<header class="top">
<div class="brand">${logo()}gsc-doctor <span class="ver">v${e(opts.version)}</span></div>
<h1>SEO check-up for <span class="site">${e(site)}</span></h1>
<p class="meta">Google Search Console · ${e(d.searchType)} search · last ${days} days (${rangeLabel(d.current)}) vs previous ${days} days (${rangeLabel(d.previous)}) · generated ${e(generated)}</p>
${d.source === 'demo' ? '<div class="ribbon"><strong>Demo data</strong> A fictional site with synthetic numbers — run without <code>--demo</code> for your own site.</div>' : ''}
<nav class="toc" aria-label="Sections">${toc.map(([id, label, count]) => `<a href="#${id}">${label}${count !== undefined ? `<span class="count">${formatInt(count)}</span>` : ''}</a>`).join('')}</nav>
</header>

${statTiles(d, days)}
${trendSection(d, days)}

<section id="summary"><h2><span class="idx">01</span>Summary</h2>${summarySection(d, opts)}</section>

<section id="actions"><h2><span class="idx">02</span>Your to-do list</h2>
<p class="lede">Every finding below, ranked by estimated clicks, how reliably the fix works, and how much work it is.</p>
${actionsSection(d, days)}</section>

<section id="striking"><h2><span class="idx">03</span>Striking distance</h2>
<p class="lede">Queries ranking just below the top results with real search demand. A few positions up is often a content refresh and some internal links away. The track shows where each query ranks today and the top-${opts.config.thresholds.striking.targetPosition} goal.</p>
${strikingSection(d.striking, opts.config, days)}</section>

<section id="low-ctr"><h2><span class="idx">04</span>Low CTR for the position</h2>
<p class="lede">Pages that rank well but are skipped in the results. Each query's impressions are weighed against the CTR expected at its position; pages far below that line need a sharper title and meta description.</p>
${lowCtrSection(d, d.lowCtr, opts, days)}</section>

<section id="losers"><h2><span class="idx">05</span>Traffic losses</h2>
<p class="lede">Pages and queries that lost clicks compared with the previous ${days} days, with the most likely cause: vanished from search, ranking drop, demand drop (fewer searches at a steady ranking) or CTR drop (same ranking and demand, fewer clicks).</p>
<h3 style="margin:18px 0 10px">Pages</h3>
${losersTable(d.losingPages, opts.config, 'pages')}
<h3 style="margin:24px 0 10px">Queries</h3>
${losersTable(d.losingQueries, opts.config, 'queries')}</section>

<section id="cannibalization"><h2><span class="idx">06</span>Keyword cannibalization</h2>
<p class="lede">Queries where several of your pages split the impressions, so none of them ranks as well as one strong page could. The bar shows each page's share of the query's impressions.</p>
${cannibalizationSection(d.cannibalization, opts.config, days)}</section>

<section id="method"><h2><span class="idx">07</span>Method</h2>${methodologySection(d, opts)}</section>

<footer>Generated by <a href="${REPO_URL}">gsc-doctor</a> v${e(opts.version)} — open source, MIT licensed. Deterministic rules; AI text is optional and labelled.</footer>
</div>
<script>${SCRIPT}</script>
</body>
</html>
`;
}
