/** Core data model shared by the fetcher, the diagnostics engine and the reporters. */

export type SearchType = 'web' | 'image' | 'video' | 'news' | 'discover' | 'googleNews';

export interface Metrics {
  clicks: number;
  impressions: number;
  /** Click-through rate as a 0–1 fraction (same as the Search Console API). */
  ctr: number;
  /** Average position, 1 = top of the results. */
  position: number;
}

export interface QueryRow extends Metrics {
  query: string;
}

export interface PageRow extends Metrics {
  page: string;
}

export interface QueryPageRow extends Metrics {
  query: string;
  page: string;
}

export interface DailyRow extends Metrics {
  /** YYYY-MM-DD (Pacific Time, like Search Console). */
  date: string;
}

/** Inclusive date range, YYYY-MM-DD. */
export interface DateRange {
  start: string;
  end: string;
}

export interface PeriodData {
  range: DateRange;
  queries: QueryRow[];
  pages: PageRow[];
  queryPages: QueryPageRow[];
}

export interface PageMeta {
  title?: string;
  description?: string;
}

/** Everything the diagnostics need: two comparable periods plus a daily series. */
export interface Dataset {
  siteUrl: string;
  searchType: SearchType;
  source: 'demo' | 'gsc';
  /** ISO timestamp of when the data was fetched or generated. */
  fetchedAt: string;
  current: PeriodData;
  previous: PeriodData;
  /** Daily totals covering previous.start … current.end. */
  daily: DailyRow[];
  /** Optional known titles/descriptions (the demo ships its own). */
  pageMeta?: Record<string, PageMeta>;
}

export type FindingType =
  | 'striking-distance'
  | 'low-ctr'
  | 'losing-page'
  | 'losing-query'
  | 'cannibalization';

export type Effort = 'low' | 'medium' | 'high';
export type Priority = 'high' | 'medium' | 'low';

/** Why an item lost clicks, derived from how impressions, CTR and position moved. */
export type LossCause = 'disappeared' | 'ranking-drop' | 'ctr-drop' | 'demand-drop' | 'mixed';

export interface StrikingDistanceFinding extends Metrics {
  query: string;
  /** Page that earns most impressions for the query, if known. */
  page?: string;
  targetPosition: number;
  expectedCtrAtTarget: number;
  /** Extra clicks per period if the query reached the target position. */
  potentialClicks: number;
}

export interface LowCtrFinding extends Metrics {
  page: string;
  /** CTR you would expect at this page's ranking positions. */
  expectedCtr: number;
  /** actual CTR / expected CTR (1 = on the curve). */
  ctrRatio: number;
  potentialClicks: number;
  /** 'queries' = position-weighted over the page's queries, 'page' = page average position. */
  basis: 'queries' | 'page';
  topQueries: QueryPageRow[];
}

export interface LosingFinding {
  kind: 'page' | 'query';
  key: string;
  /** For queries: the page that earned most of its impressions in the previous period. */
  page?: string;
  current: Metrics;
  previous: Metrics;
  clickDelta: number;
  /** -1 … +∞, e.g. -0.42 = 42% fewer clicks. */
  clickDeltaPct: number;
  impressionDeltaPct: number;
  ctrDeltaPct: number;
  /** current − previous; positive means the ranking got worse. */
  positionDelta: number;
  cause: LossCause;
  /** Part of the click change explained by impressions (volume). */
  volumeEffect: number;
  /** Part of the click change explained by CTR. volumeEffect + ctrEffect = clickDelta. */
  ctrEffect: number;
}

export interface CannibalizingPage extends Metrics {
  page: string;
  /** Share of the query's impressions, 0–1. */
  share: number;
}

export interface CannibalizationFinding {
  query: string;
  clicks: number;
  impressions: number;
  pages: CannibalizingPage[];
  primaryPage: string;
  bestPosition: number;
  /** 1 − largest share: 0 = one page dominates, ~0.5+ = visibility split evenly. */
  splitScore: number;
  potentialClicks: number;
}

export interface Action {
  id: string;
  type: FindingType;
  title: string;
  detail: string;
  target: string;
  estimatedClicks: number;
  effort: Effort;
  confidence: number;
  score: number;
  priority: Priority;
}

export interface CtrCurve {
  /** CTR for positions 1…20 (index 0 = position 1). */
  points: number[];
  source: 'site' | 'default';
  /** How many of the 20 positions came from this site's own data. */
  sitePositions: number;
}

export interface Diagnosis {
  siteUrl: string;
  searchType: SearchType;
  source: Dataset['source'];
  generatedAt: string;
  fetchedAt: string;
  current: DateRange;
  previous: DateRange;
  totals: { current: Metrics; previous: Metrics };
  daily: DailyRow[];
  ctrCurve: CtrCurve;
  defaultCurve: number[];
  /** Pages (current period, enough impressions, top 20) for the CTR-curve chart. */
  pagePoints: Array<{ page: string; position: number; ctr: number; impressions: number }>;
  striking: StrikingDistanceFinding[];
  lowCtr: LowCtrFinding[];
  losingPages: LosingFinding[];
  losingQueries: LosingFinding[];
  cannibalization: CannibalizationFinding[];
  actions: Action[];
  summary: string[];
  pageMeta: Record<string, PageMeta>;
}

export interface TitleSuggestion {
  page: string;
  titles: string[];
  metaDescription: string;
  rationale?: string;
}

export interface AiInsights {
  model: string;
  summary: string;
  highlights: string[];
  titleSuggestions: TitleSuggestion[];
  /** True for the canned example shown in --demo when no API key is set. */
  sample?: boolean;
}
