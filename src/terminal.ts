import { CAUSE_LABEL } from './diagnostics/summary.js';
import { formatInt, formatPct, formatPosition, formatSignedPct, truncate } from './format.js';
import { pctChange } from './metrics.js';
import { siteLabel } from './report/html.js';
import type { Action, AiInsights, Diagnosis } from './types.js';

export interface Colors {
  bold: (s: string) => string;
  dim: (s: string) => string;
  red: (s: string) => string;
  green: (s: string) => string;
  yellow: (s: string) => string;
  blue: (s: string) => string;
}

const wrapAnsi = (open: number, close: number) => (s: string) => `\u001b[${open}m${s}\u001b[${close}m`;

export function createColors(enabled: boolean): Colors {
  if (!enabled) {
    const id = (s: string) => s;
    return { bold: id, dim: id, red: id, green: id, yellow: id, blue: id };
  }
  return { bold: wrapAnsi(1, 22), dim: wrapAnsi(2, 22), red: wrapAnsi(31, 39), green: wrapAnsi(32, 39), yellow: wrapAnsi(33, 39), blue: wrapAnsi(34, 39) };
}

/** Respects NO_COLOR / FORCE_COLOR (https://no-color.org) and TTY detection. */
export function colorEnabled(stream: NodeJS.WriteStream, env: NodeJS.ProcessEnv, disabledByFlag: boolean): boolean {
  if (disabledByFlag || 'NO_COLOR' in env) return false;
  if (env.FORCE_COLOR && env.FORCE_COLOR !== '0') return true;
  return !!stream.isTTY && env.TERM !== 'dumb';
}

export function wrapText(text: string, width: number, indent: string): string {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    if (line && line.length + 1 + word.length > width - indent.length) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  return lines.map((l) => indent + l).join('\n');
}

function delta(current: number, previous: number, c: Colors, lowerIsBetter = false): string {
  if (lowerIsBetter) {
    const diff = current - previous;
    if (Math.abs(diff) < 0.05) return c.dim('no change');
    return diff < 0 ? c.green(`▲ ${Math.abs(diff).toFixed(1)} better`) : c.red(`▼ ${diff.toFixed(1)} worse`);
  }
  const change = pctChange(current, previous);
  if (!Number.isFinite(change)) return c.green('new');
  if (Math.abs(change) < 0.005) return c.dim('no change');
  const text = formatSignedPct(change).replace(/^[+−]/, '');
  return change > 0 ? c.green(`▲ ${text}`) : c.red(`▼ ${text}`);
}

const PRIORITY_LABEL = { high: 'HIGH', medium: 'MED ', low: 'LOW ' } as const;

function actionLine(a: Action, rank: number, c: Colors, width: number, days: number): string {
  const badge = a.priority === 'high' ? c.red(PRIORITY_LABEL.high) : a.priority === 'medium' ? c.yellow(PRIORITY_LABEL.medium) : c.dim(PRIORITY_LABEL.low);
  const gain = a.type.startsWith('losing') ? `${formatInt(a.estimatedClicks)} clicks lost` : `+${formatInt(a.estimatedClicks)} clicks`;
  const num = String(rank).padStart(3);
  return `${c.dim(num)}  ${badge}  ${truncate(a.title, width - 13)}\n${' '.repeat(11)}${c.dim(`${gain} / ${days}d · effort ${a.effort}`)}`;
}

export interface TerminalOptions {
  colors: Colors;
  top: number;
  width?: number;
  ai?: AiInsights;
  aiNote?: string;
}

export function renderTerminal(d: Diagnosis, options: TerminalOptions): string {
  const c = options.colors;
  const width = Math.max(60, Math.min(options.width ?? 100, 110));
  const days = d.daily.filter((x) => x.date >= d.current.start && x.date <= d.current.end).length || 28;
  const { current, previous } = d.totals;
  const out: string[] = [];

  out.push('');
  out.push(`${c.bold(c.blue('gsc-doctor'))}  SEO check-up for ${c.bold(siteLabel(d.siteUrl))}${d.source === 'demo' ? c.dim('  (demo data)') : ''}`);
  out.push(c.dim(`Last ${days} days (${d.current.start} → ${d.current.end}) vs previous ${days} days (${d.previous.start} → ${d.previous.end})`));
  out.push('');
  const row = (label: string, value: string, change: string) => `  ${label.padEnd(13)}${value.padStart(10)}   ${change}`;
  out.push(row('Clicks', formatInt(current.clicks), delta(current.clicks, previous.clicks, c)));
  out.push(row('Impressions', formatInt(current.impressions), delta(current.impressions, previous.impressions, c)));
  out.push(row('CTR', formatPct(current.ctr), delta(current.ctr, previous.ctr, c)));
  out.push(row('Position', formatPosition(current.position), delta(current.position, previous.position, c, true)));

  out.push('');
  out.push(c.bold('Diagnosis'));
  for (const line of d.summary) out.push(wrapText(line, width, '    ').replace(/^ {4}/, '  • '));

  if (options.ai && !options.ai.sample) {
    out.push('');
    out.push(`${c.bold('In plain words')} ${c.dim(`(Gemini · ${options.ai.model})`)}`);
    out.push(wrapText(options.ai.summary, width, '  '));
  }
  if (options.aiNote) {
    out.push('');
    out.push(c.dim(wrapText(options.aiNote, width, '  ')));
  }

  out.push('');
  const shown = d.actions.slice(0, options.top);
  out.push(c.bold(`To-do${d.actions.length > shown.length ? ` (top ${shown.length} of ${d.actions.length})` : ''}`));
  if (shown.length === 0) out.push('  Nothing crossed the thresholds.');
  shown.forEach((a, i) => out.push(actionLine(a, i + 1, c, width, days)));

  const worst = d.losingPages[0];
  out.push('');
  out.push(
    c.dim(
      `Found ${d.striking.length} striking-distance queries · ${d.lowCtr.length} low-CTR pages · ` +
        `${d.losingPages.length} losing pages${worst ? ` (top cause: ${CAUSE_LABEL[worst.cause]})` : ''} · ` +
        `${d.losingQueries.length} losing queries · ${d.cannibalization.length} cannibalized queries`,
    ),
  );
  return out.join('\n');
}
