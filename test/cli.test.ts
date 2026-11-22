import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { main } from '../src/main.js';

describe('cli', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gsc-doctor-cli-'));
  let stdout: string[];
  let stderr: string[];

  beforeEach(() => {
    stdout = [];
    stderr = [];
    vi.stubEnv('GEMINI_API_KEY', '');
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => void stdout.push(args.join(' ')));
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk: string | Uint8Array) => {
      stderr.push(String(chunk));
      return true;
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('builds the demo report in well under 5 seconds', async () => {
    const out = join(dir, 'demo.html');
    const json = join(dir, 'demo.json');
    const started = performance.now();
    const code = await main(['--demo', '--out', out, '--json', json, '--no-color']);
    expect(code).toBe(0);
    expect(performance.now() - started).toBeLessThan(5000);
    expect(existsSync(out)).toBe(true);
    expect(readFileSync(out, 'utf8')).toContain('SEO check-up for');
    expect(JSON.parse(readFileSync(json, 'utf8')).diagnosis.siteUrl).toBe('https://example.com/');
    const text = stdout.join('\n');
    expect(text).toContain('To-do');
    expect(text).toContain('Report saved');
    expect(text).not.toMatch(/\u001b\[/); // --no-color
  });

  it('prints help and version', async () => {
    expect(await main(['--help'])).toBe(0);
    expect(stdout.join('\n')).toContain('npx gsc-doctor --demo');
    expect(await main(['--version'])).toBe(0);
    expect(stdout.at(-1)).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('rejects unknown flags and bad values with exit code 2', async () => {
    expect(await main(['--nope'])).toBe(2);
    expect(await main(['--demo', '--days', '3', '--out', join(dir, 'x.html')])).toBe(2);
    expect(stderr.join('')).toContain('--days must be');
  });

  it('asks for a site (and suggests the demo) when none is given', async () => {
    vi.stubEnv('GSC_SITE', '');
    expect(await main(['--no-color'])).toBe(2);
    expect(stderr.join('')).toContain('npx gsc-doctor --demo');
  });
});
