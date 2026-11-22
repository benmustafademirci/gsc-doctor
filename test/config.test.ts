import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ConfigError, DEFAULT_CONFIG, isBranded, loadConfigFile, resolveConfig } from '../src/config.js';

describe('resolveConfig', () => {
  it('returns the documented defaults', () => {
    const config = resolveConfig();
    expect(config).toEqual(DEFAULT_CONFIG);
    expect(config).not.toBe(DEFAULT_CONFIG);
  });

  it('deep-merges partial overrides in order', () => {
    const config = resolveConfig({ thresholds: { striking: { minImpressions: 50 } } }, { thresholds: { striking: { maxPosition: 15 } } });
    expect(config.thresholds.striking).toEqual({ ...DEFAULT_CONFIG.thresholds.striking, minImpressions: 50, maxPosition: 15 });
    expect(config.thresholds.lowCtr).toEqual(DEFAULT_CONFIG.thresholds.lowCtr);
  });

  it('normalizes brand terms', () => {
    expect(resolveConfig({ brandTerms: ['  Example Outdoors ', ''] }).brandTerms).toEqual(['example outdoors']);
  });

  it('rejects unknown keys and wrong types', () => {
    expect(() => resolveConfig({ thresholds: { striking: { minImpresions: 1 } } } as never)).toThrow(ConfigError);
    expect(() => resolveConfig({ thresholds: { striking: { minImpressions: '100' } } } as never)).toThrow(/non-negative number/);
    expect(() => resolveConfig({ thresholds: { ctr: { model: 'magic' } } } as never)).toThrow(/"site" or "default"/);
    expect(() => resolveConfig({ thresholds: { striking: { minPosition: 30 } } })).toThrow(/must not exceed/);
  });
});

describe('loadConfigFile', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gsc-doctor-config-'));

  it('returns undefined when the default file is absent', () => {
    expect(loadConfigFile(undefined, dir)).toBeUndefined();
  });

  it('reads gsc-doctor.config.json and ignores $schema', () => {
    writeFileSync(join(dir, 'gsc-doctor.config.json'), JSON.stringify({ $schema: './schema.json', topActions: 5 }));
    expect(loadConfigFile(undefined, dir)).toEqual({ topActions: 5 });
  });

  it('fails clearly on a missing explicit file or invalid JSON', () => {
    expect(() => loadConfigFile('nope.json', dir)).toThrow(/not found/);
    writeFileSync(join(dir, 'broken.json'), '{ nope');
    expect(() => loadConfigFile('broken.json', dir)).toThrow(/Could not parse/);
  });
});

describe('isBranded', () => {
  it('matches case-insensitive substrings', () => {
    expect(isBranded('Example Outdoors returns', ['example outdoors'])).toBe(true);
    expect(isBranded('hiking boots', ['example outdoors'])).toBe(false);
    expect(isBranded('anything', [])).toBe(false);
  });
});
