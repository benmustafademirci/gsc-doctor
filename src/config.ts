import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Every threshold the diagnostics use. All impression/click numbers are per
 * comparison period (28 days by default). Override any subset in
 * `gsc-doctor.config.json` — see README "Thresholds".
 */
export interface Thresholds {
  striking: {
    /** Best (lowest) average position still considered "striking distance". */
    minPosition: number;
    /** Worst (highest) average position considered. */
    maxPosition: number;
    minImpressions: number;
    /** Position used to estimate the upside. */
    targetPosition: number;
  };
  lowCtr: {
    /** Only pages ranking at or above this average position. */
    maxPosition: number;
    minImpressions: number;
    /** Flag when actual CTR is below this fraction of the expected CTR. */
    maxCtrRatio: number;
  };
  losers: {
    /** Minimum absolute click loss to report. */
    minClickLoss: number;
    /** Minimum relative click loss to report, 0–1. */
    minClickLossPct: number;
    /** Average-position drop that counts as a ranking drop. */
    positionDrop: number;
    /** Relative impressions drop (at stable position) that counts as a demand drop, 0–1. */
    demandDropPct: number;
    /** Relative CTR drop (at stable position and demand) that counts as a CTR drop, 0–1. */
    ctrDropPct: number;
  };
  cannibalization: {
    minImpressions: number;
    /** A page must hold at least this share of the query's impressions, 0–1. */
    minPageShare: number;
    /** Include queries that contain a brand term. */
    includeBranded: boolean;
  };
  ctr: {
    /** 'site' learns the curve from your own non-brand queries, 'default' uses the generic curve only. */
    model: 'site' | 'default';
    /** Queries need this many impressions to count towards the site curve. */
    minImpressionsForCurve: number;
    /** Positions with fewer qualifying queries fall back to the generic curve. */
    minQueriesPerPosition: number;
  };
}

export interface Config {
  thresholds: Thresholds;
  /** Case-insensitive substrings that mark a query as branded. */
  brandTerms: string[];
  /** Rows per section in the HTML report before "show more". */
  maxRowsPerSection: number;
  /** Items in the terminal to-do list. */
  topActions: number;
}

export const DEFAULT_CONFIG: Config = {
  thresholds: {
    striking: { minPosition: 4, maxPosition: 20, minImpressions: 100, targetPosition: 3 },
    lowCtr: { maxPosition: 10, minImpressions: 300, maxCtrRatio: 0.6 },
    losers: {
      minClickLoss: 10,
      minClickLossPct: 0.2,
      positionDrop: 1.5,
      demandDropPct: 0.25,
      ctrDropPct: 0.25,
    },
    cannibalization: { minImpressions: 100, minPageShare: 0.1, includeBranded: false },
    ctr: { model: 'site', minImpressionsForCurve: 50, minQueriesPerPosition: 5 },
  },
  brandTerms: [],
  maxRowsPerSection: 25,
  topActions: 10,
};

export const CONFIG_FILE_NAME = 'gsc-doctor.config.json';

export class ConfigError extends Error {
  override name = 'ConfigError';
}

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? (T[K] extends unknown[] ? T[K] : DeepPartial<T[K]>) : T[K] };
export type PartialConfig = DeepPartial<Config>;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Deep-merges `override` into `base`, validating types against the base values. */
function mergeInto(base: Record<string, unknown>, override: Record<string, unknown>, path: string): void {
  for (const [key, value] of Object.entries(override)) {
    const here = path ? `${path}.${key}` : key;
    if (!(key in base)) throw new ConfigError(`Unknown config key "${here}".`);
    const current = base[key];
    if (isPlainObject(current)) {
      if (!isPlainObject(value)) throw new ConfigError(`"${here}" must be an object.`);
      mergeInto(current, value, here);
    } else if (Array.isArray(current)) {
      if (!Array.isArray(value) || !value.every((v) => typeof v === 'string')) {
        throw new ConfigError(`"${here}" must be an array of strings.`);
      }
      base[key] = [...value];
    } else if (typeof current === 'number') {
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
        throw new ConfigError(`"${here}" must be a non-negative number.`);
      }
      base[key] = value;
    } else if (typeof current === 'boolean') {
      if (typeof value !== 'boolean') throw new ConfigError(`"${here}" must be true or false.`);
      base[key] = value;
    } else if (typeof current === 'string') {
      if (typeof value !== 'string') throw new ConfigError(`"${here}" must be a string.`);
      base[key] = value;
    }
  }
}

export function resolveConfig(...overrides: Array<PartialConfig | undefined>): Config {
  const config = structuredClone(DEFAULT_CONFIG);
  for (const override of overrides) {
    if (override) mergeInto(config as unknown as Record<string, unknown>, override as Record<string, unknown>, '');
  }
  const t = config.thresholds;
  if (t.ctr.model !== 'site' && t.ctr.model !== 'default') {
    throw new ConfigError('"thresholds.ctr.model" must be "site" or "default".');
  }
  if (t.striking.minPosition > t.striking.maxPosition) {
    throw new ConfigError('"thresholds.striking.minPosition" must not exceed "maxPosition".');
  }
  config.brandTerms = config.brandTerms.map((term) => term.trim().toLowerCase()).filter(Boolean);
  return config;
}

/**
 * Loads a JSON config file. With no explicit path, `./gsc-doctor.config.json`
 * is used when it exists.
 */
export function loadConfigFile(explicitPath: string | undefined, cwd = process.cwd()): PartialConfig | undefined {
  const path = explicitPath ? resolve(cwd, explicitPath) : resolve(cwd, CONFIG_FILE_NAME);
  if (!existsSync(path)) {
    if (explicitPath) throw new ConfigError(`Config file not found: ${path}`);
    return undefined;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new ConfigError(`Could not parse ${path}: ${(error as Error).message}`);
  }
  if (!isPlainObject(parsed)) throw new ConfigError(`${path} must contain a JSON object.`);
  const { $schema: _schema, ...rest } = parsed;
  return rest as PartialConfig;
}

export function isBranded(query: string, brandTerms: readonly string[]): boolean {
  if (brandTerms.length === 0) return false;
  const q = query.toLowerCase();
  return brandTerms.some((term) => q.includes(term));
}
