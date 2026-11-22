/**
 * Synthetic Search Console data for a fictional outdoor-gear site on
 * example.com (a domain reserved for documentation, RFC 2606). Nothing here
 * comes from a real site or person. The data is deterministic for a given end
 * date and is shaped so every diagnostic has something to show: striking
 * distance queries, pages with weak snippets, a ranking drop, a CTR drop, a
 * seasonal demand drop, a page that vanished, and cannibalizing articles.
 */
import { DEFAULT_CTR_CURVE, TAIL_CTR } from '../ctr.js';
import { addDays, comparisonWindows, eachDay, todayInPacific } from '../dates.js';
import { combineMetrics, groupMetrics } from '../metrics.js';
import type { DailyRow, Dataset, PageMeta, PeriodData, QueryPageRow } from '../types.js';

export const DEMO_SITE = 'https://example.com/';
export const DEMO_BRAND_TERMS = ['example outdoors'];

const BASE = 'https://example.com';

/** [impressions, position, ctr]; ctr omitted = "normal" CTR for that position. */
type Snapshot = [impressions: number, position: number, ctr?: number];
interface Scenario {
  query: string;
  path: string;
  cur: Snapshot;
  prev: Snapshot;
}

const SCENARIOS: Scenario[] = [
  // Brand queries (excluded from CTR benchmarks via DEMO_BRAND_TERMS).
  { query: 'example outdoors', path: '/', cur: [5200, 1.1, 0.46], prev: [5000, 1.1, 0.47] },
  { query: 'example outdoors discount code', path: '/sale/', cur: [1400, 1.3, 0.31], prev: [1250, 1.4, 0.3] },
  { query: 'example outdoors returns', path: '/returns/', cur: [620, 1.2, 0.38], prev: [600, 1.2, 0.37] },
  { query: 'example outdoors size guide', path: '/size-guide/', cur: [380, 1.0, 0.41], prev: [350, 1.1, 0.4] },

  // Striking distance: decent impressions just below the top results.
  { query: 'best trail running shoes', path: '/blog/best-trail-running-shoes/', cur: [9400, 7.8], prev: [9100, 8.1] },
  { query: 'ultralight tent', path: '/blog/best-ultralight-tents/', cur: [6800, 11.6], prev: [6500, 12.3] },
  { query: 'how to pack a backpack', path: '/blog/how-to-pack-a-backpack/', cur: [4100, 9.2], prev: [3900, 9.5] },
  { query: 'merino hiking socks', path: '/products/merino-hiking-socks/', cur: [3200, 6.3], prev: [3000, 6.8] },
  { query: '2 person ultralight tent', path: '/products/ultralight-2p-tent/', cur: [2600, 14.2], prev: [2400, 15.0] },
  { query: '40l hiking backpack', path: '/products/40l-hiking-backpack/', cur: [2300, 12.8], prev: [2200, 13.5] },
  { query: 'headlamp lumens for hiking', path: '/blog/headlamp-buying-guide/', cur: [1700, 15.1], prev: [1500, 16.0] },
  { query: 'tents', path: '/category/tents/', cur: [3900, 16.5], prev: [3800, 17.1] },

  // Ranking drop: the trekking poles guide slipped off page one.
  { query: 'are trekking poles worth it', path: '/blog/trekking-poles-guide/', cur: [2900, 13.4], prev: [3100, 4.2] },
  { query: 'trekking poles guide', path: '/blog/trekking-poles-guide/', cur: [1300, 11.8], prev: [1400, 3.9] },
  { query: 'how to use trekking poles', path: '/blog/trekking-poles-guide/', cur: [900, 12.5], prev: [950, 5.1] },

  // CTR drop: same ranking and demand, far fewer clicks (e.g. an AI answer now covers it).
  { query: 'hydration pack vs water bottle', path: '/blog/hydration-pack-vs-water-bottles/', cur: [5600, 2.0, 0.07], prev: [5800, 2.1, 0.19] },
  { query: 'is a hydration pack worth it', path: '/blog/hydration-pack-vs-water-bottles/', cur: [2100, 2.6, 0.05], prev: [2000, 2.7, 0.15] },

  // Demand drop: seasonal content after the summer.
  { query: 'summer camping checklist', path: '/blog/summer-camping-checklist/', cur: [7400, 3.0], prev: [21800, 3.1] },
  { query: 'camping checklist printable', path: '/blog/summer-camping-checklist/', cur: [2600, 4.4], prev: [6900, 4.2] },

  // Disappeared: the page dropped out of the index.
  { query: 'gps watch comparison', path: '/blog/gps-watch-comparison/', cur: [0, 0], prev: [4300, 3.6] },
  { query: 'best gps watch for hiking', path: '/blog/gps-watch-comparison/', cur: [0, 0], prev: [2700, 5.2] },

  // Low CTR for position: good rankings, weak titles/descriptions.
  { query: 'how to choose a sleeping bag', path: '/blog/how-to-choose-a-sleeping-bag/', cur: [8200, 3.2, 0.021], prev: [7900, 3.3, 0.024] },
  // A "jump to" #fragment URL — merged with its page, so not flagged as cannibalization.
  { query: 'sleeping bag temperature rating', path: '/blog/how-to-choose-a-sleeping-bag/#temperature-ratings', cur: [3600, 2.8, 0.03], prev: [3300, 2.9, 0.033] },
  { query: 'sleeping bag temperature rating', path: '/blog/how-to-choose-a-sleeping-bag/', cur: [1200, 3.4, 0.028], prev: [1100, 3.5, 0.03] },
  { query: 'waterproof vs water resistant jacket', path: '/blog/waterproof-vs-water-resistant-jackets/', cur: [6100, 2.4, 0.041], prev: [5900, 2.5, 0.045] },
  { query: 'hiking boots', path: '/category/hiking-boots/', cur: [7200, 5.1, 0.01], prev: [6800, 5.4, 0.012] },
  { query: 'mens hiking boots', path: '/category/hiking-boots/', cur: [2400, 6.2, 0.009], prev: [2300, 6.5, 0.011] },
  { query: 'blister prevention hiking', path: '/blog/blister-prevention-tips/', cur: [2800, 4.0, 0.022], prev: [2600, 4.2, 0.024] },

  // Cannibalization: several articles answer the same query.
  { query: 'trail running shoes for beginners', path: '/blog/best-trail-running-shoes/', cur: [2100, 9.1], prev: [2000, 9.4] },
  { query: 'trail running shoes for beginners', path: '/blog/trail-running-for-beginners/', cur: [1800, 11.3], prev: [1900, 10.8] },
  { query: 'trail running shoes for beginners', path: '/category/trail-running-shoes/', cur: [480, 23.5], prev: [450, 24.0] },
  { query: 'how to clean hiking boots', path: '/blog/how-to-clean-hiking-boots/', cur: [2900, 6.5], prev: [2700, 6.1] },
  { query: 'how to clean hiking boots', path: '/blog/hiking-boot-care-guide/', cur: [2400, 7.9], prev: [2300, 8.4] },
  { query: 'winter hiking layers', path: '/blog/winter-hiking-layering-guide/', cur: [3300, 8.4], prev: [1400, 9.0] },
  { query: 'winter hiking layers', path: '/guides/beginner-hiking-gear-list/', cur: [1500, 10.6], prev: [700, 11.0] },

  // Growing pages, so the report is not all bad news.
  { query: 'what to wear winter hiking', path: '/blog/winter-hiking-layering-guide/', cur: [4200, 5.5], prev: [1600, 6.0] },
  { query: 'rain jacket', path: '/category/rain-jackets/', cur: [5100, 8.9], prev: [3800, 10.4] },
  { query: 'alpine shell jacket', path: '/products/alpine-shell-jacket/', cur: [900, 3.1], prev: [700, 3.5] },
  { query: 'trail runner x2 review', path: '/products/trail-runner-x2/', cur: [1100, 2.2], prev: [1000, 2.4] },
  { query: 'beginner hiking gear list', path: '/guides/beginner-hiking-gear-list/', cur: [2700, 3.8], prev: [2500, 4.1] },
];

/** Long-tail vocabulary: each item maps to the page that should rank for it. */
const LONG_TAIL_ITEMS: Array<[item: string, path: string]> = [
  ['hiking backpack', '/products/40l-hiking-backpack/'],
  ['trail running shoes', '/category/trail-running-shoes/'],
  ['rain jacket', '/category/rain-jackets/'],
  ['sleeping pad', '/blog/how-to-choose-a-sleeping-bag/'],
  ['backpacking tent', '/category/tents/'],
  ['hiking boots', '/category/hiking-boots/'],
  ['hiking socks', '/products/merino-hiking-socks/'],
  ['base layer', '/blog/winter-hiking-layering-guide/'],
  ['trekking poles', '/blog/trekking-poles-guide/'],
  ['headlamp', '/blog/headlamp-buying-guide/'],
  ['hydration pack', '/blog/hydration-pack-vs-water-bottles/'],
  ['shell jacket', '/products/alpine-shell-jacket/'],
];
const LONG_TAIL_MODIFIERS = ['best', 'lightweight', 'waterproof', 'womens', 'mens', 'budget', 'durable', 'cheap', 'packable', 'breathable'];
const LONG_TAIL_SUFFIXES = ['', ' review', ' for beginners', ' for day hikes', ' sale', ' size chart', ' vs', ' for wide feet', ' for thru hiking'];

export const DEMO_PAGE_META: Record<string, PageMeta> = {
  [`${BASE}/blog/how-to-choose-a-sleeping-bag/`]: {
    title: 'Sleeping Bags | Example Outdoors Blog',
    description: 'Read our latest article about sleeping bags.',
  },
  [`${BASE}/blog/waterproof-vs-water-resistant-jackets/`]: {
    title: 'Waterproof vs Water Resistant - Example Outdoors',
  },
  [`${BASE}/category/hiking-boots/`]: {
    title: 'Hiking Boots - Shop - Example Outdoors',
    description: 'Hiking boots category page.',
  },
  [`${BASE}/blog/blister-prevention-tips/`]: {
    title: 'Blisters | Blog',
    description: 'Tips.',
  },
  [`${BASE}/blog/hydration-pack-vs-water-bottles/`]: {
    title: 'Hydration Pack vs Water Bottles',
    description: 'We compare hydration packs and water bottles.',
  },
};

/** Small, fast, seeded PRNG (mulberry32) so the demo is reproducible. */
function createRandom(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const normal = () => {
    const u = Math.max(next(), 1e-12);
    const v = next();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  const between = (min: number, max: number) => min + (max - min) * next();
  const pick = <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)]!;
  return { next, normal, between, pick };
}

/** "Normal" CTR for this fictional site: a bit below the generic curve. */
function siteCtr(position: number): number {
  if (position > DEFAULT_CTR_CURVE.length) return TAIL_CTR * 0.9;
  const lower = Math.max(1, Math.floor(position));
  const upper = Math.min(DEFAULT_CTR_CURVE.length, lower + 1);
  const a = DEFAULT_CTR_CURVE[lower - 1]!;
  const b = DEFAULT_CTR_CURVE[upper - 1]!;
  return (a + (b - a) * (position - lower)) * 0.92;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

function toRow(query: string, path: string, [impressions, position, ctr]: Snapshot): QueryPageRow | undefined {
  if (impressions <= 0) return undefined;
  const clicks = Math.round(impressions * (ctr ?? siteCtr(position)));
  return { query, page: `${BASE}${path}`, clicks, impressions, ctr: clicks / impressions, position };
}

function longTail(random: ReturnType<typeof createRandom>): Scenario[] {
  const seen = new Set(SCENARIOS.map((s) => s.query));
  const rows: Scenario[] = [];
  let guard = 0;
  while (rows.length < 190 && guard++ < 5000) {
    const [item, path] = random.pick(LONG_TAIL_ITEMS);
    const query = `${random.pick(LONG_TAIL_MODIFIERS)} ${item}${random.pick(LONG_TAIL_SUFFIXES)}`.trim();
    if (seen.has(query)) continue;
    seen.add(query);
    // Bias positions towards page one/two, like a real long tail.
    const position = round1(Math.min(38, 1 + Math.abs(random.normal()) * 7 + random.next() * 2));
    const impressions = Math.round(40 + Math.pow(random.next(), 2) * 640);
    const ctr = Math.min(0.6, siteCtr(position) * Math.exp(random.normal() * 0.22));
    const drift = random.between(0.86, 1.14);
    const prevPosition = round1(Math.max(1, position + random.normal() * 0.6));
    rows.push({
      query,
      path,
      cur: [impressions, position, ctr],
      prev: [Math.round(impressions * drift), prevPosition, Math.min(0.6, ctr * random.between(0.9, 1.1))],
    });
  }
  return rows;
}

function buildPeriod(range: PeriodData['range'], rows: QueryPageRow[]): PeriodData {
  const queries = [...groupMetrics(rows, (r) => r.query)].map(([query, m]) => ({ query, ...m }));
  const pages = [...groupMetrics(rows, (r) => r.page)].map(([page, m]) => ({ page, ...m }));
  const byClicks = <T extends { clicks: number; impressions: number }>(a: T, b: T) => b.clicks - a.clicks || b.impressions - a.impressions;
  return { range, queries: queries.sort(byClicks), pages: pages.sort(byClicks), queryPages: [...rows].sort(byClicks) };
}

/** Spreads period totals over days with a weekly rhythm and a little noise. */
function dailySeries(range: PeriodData['range'], rows: QueryPageRow[], random: ReturnType<typeof createRandom>, trend: number): DailyRow[] {
  const totals = combineMetrics(rows);
  const days = eachDay(range);
  // Outdoor content peaks at the weekend (index 0 = Sunday).
  const weekday = [1.14, 0.96, 0.95, 0.94, 0.93, 0.98, 1.1];
  const weights = days.map((date, i) => {
    const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
    return weekday[dow]! * (1 + trend * (i / (days.length - 1) - 0.5));
  });
  const spread = (total: number, noise: number) => {
    const w = weights.map((x) => x * Math.exp(random.normal() * noise));
    const sum = w.reduce((a, b) => a + b, 0);
    const values = w.map((x) => Math.round((total * x) / sum));
    const diff = Math.round(total) - values.reduce((a, b) => a + b, 0);
    values[values.length - 1]! += diff;
    return values;
  };
  const clicks = spread(totals.clicks, 0.05);
  const impressions = spread(totals.impressions, 0.04);
  return days.map((date, i) => ({
    date,
    clicks: clicks[i]!,
    impressions: impressions[i]!,
    ctr: impressions[i]! > 0 ? clicks[i]! / impressions[i]! : 0,
    position: round1(Math.max(1, totals.position + random.normal() * 0.25)),
  }));
}

export interface DemoOptions {
  /** Last day of the current period (YYYY-MM-DD). Defaults to 3 days ago, Pacific Time. */
  endDate?: string;
  days?: number;
  now?: Date;
}

export function generateDemoDataset(options: DemoOptions = {}): Dataset {
  const now = options.now ?? new Date();
  const days = options.days ?? 28;
  const endDate = options.endDate ?? addDays(todayInPacific(now), -3);
  const { current, previous } = comparisonWindows(endDate, days);
  const random = createRandom(20261122);

  const scenarios = [...SCENARIOS, ...longTail(random)];
  const currentRows = scenarios.map((s) => toRow(s.query, s.path, s.cur)).filter((r): r is QueryPageRow => !!r);
  const previousRows = scenarios.map((s) => toRow(s.query, s.path, s.prev)).filter((r): r is QueryPageRow => !!r);

  return {
    siteUrl: DEMO_SITE,
    searchType: 'web',
    source: 'demo',
    fetchedAt: now.toISOString(),
    current: buildPeriod(current, currentRows),
    previous: buildPeriod(previous, previousRows),
    daily: [...dailySeries(previous, previousRows, random, 0.06), ...dailySeries(current, currentRows, random, -0.04)],
    pageMeta: DEMO_PAGE_META,
  };
}
