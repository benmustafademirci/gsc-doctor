const intFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const compactFormat = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });

export function formatInt(value: number): string {
  return intFormat.format(Math.round(value));
}

export function formatCompact(value: number): string {
  return Math.abs(value) < 10_000 ? formatInt(value) : compactFormat.format(value);
}

/** 0.0532 → "5.3%" */
export function formatPct(fraction: number, digits = 1): string {
  if (!Number.isFinite(fraction)) return '—';
  return `${(fraction * 100).toFixed(digits)}%`;
}

/** 0.12 → "+12%", -0.4 → "−40%", Infinity → "new" */
export function formatSignedPct(fraction: number, digits = 0): string {
  if (fraction === Number.POSITIVE_INFINITY) return 'new';
  if (!Number.isFinite(fraction)) return '—';
  const value = (fraction * 100).toFixed(digits);
  if (Number(value) === 0) return '0%';
  return fraction > 0 ? `+${value}%` : `−${value.replace('-', '')}%`;
}

export function formatSignedInt(value: number): string {
  const rounded = Math.round(value);
  if (rounded === 0) return '0';
  return rounded > 0 ? `+${formatInt(rounded)}` : `−${formatInt(-rounded)}`;
}

export function formatPosition(position: number): string {
  return position > 0 ? position.toFixed(1) : '—';
}

/** "https://example.com/blog/post/?a=1" → "/blog/post/?a=1" (keeps other URLs as-is). */
export function shortUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.pathname}${parsed.search}${parsed.hash}` || '/';
  } catch {
    return url;
  }
}

export function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, Math.max(0, max - 1))}…`;
}
