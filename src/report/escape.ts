/** Search queries and URLs are user-generated: escape everything that reaches HTML. */
export function escapeHtml(value: unknown): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const LINE_SEPARATOR = String.fromCharCode(0x2028);
const PARAGRAPH_SEPARATOR = String.fromCharCode(0x2029);

/** JSON that is safe to embed inside a <script> element. */
export function jsonForScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .split(LINE_SEPARATOR).join('\\u2028')
    .split(PARAGRAPH_SEPARATOR).join('\\u2029');
}

/** Only http(s) links become clickable; anything else is rendered as text. */
export function safeHref(url: string): string | undefined {
  return /^https?:\/\//i.test(url) ? escapeHtml(url) : undefined;
}

/** Tooltip payload: lines joined by newlines, read by the inline script with textContent. */
export function tip(lines: string[]): string {
  return `data-tip="${escapeHtml(lines.join('\n'))}" tabindex="0"`;
}
