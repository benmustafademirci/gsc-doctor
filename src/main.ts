import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { fetchPageMeta } from './ai/pageMeta.js';
import { DEFAULT_GEMINI_MODEL, generateInsights } from './ai/gemini.js';
import { ConfigError, loadConfigFile, resolveConfig, type PartialConfig } from './config.js';
import { DEMO_BRAND_TERMS, generateDemoDataset } from './demo/generate.js';
import { DEMO_SAMPLE_AI } from './demo/sampleAi.js';
import { diagnose } from './diagnostics/index.js';
import { AuthError, resolveAuth } from './gsc/auth.js';
import { GscApiError, GscClient } from './gsc/client.js';
import { NoDataError, fetchDataset, matchSite } from './gsc/fetch.js';
import { openFile } from './open.js';
import { renderReport, siteLabel } from './report/html.js';
import { colorEnabled, createColors, renderTerminal, type Colors } from './terminal.js';
import type { AiInsights, Dataset, SearchType } from './types.js';

export const VERSION: string = (() => {
  try {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version?: string };
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
})();

const SEARCH_TYPES: SearchType[] = ['web', 'image', 'video', 'news', 'discover', 'googleNews'];

const HELP = `gsc-doctor ${VERSION}
Turns Google Search Console data into a prioritized SEO to-do list and a
single-file HTML report. https://github.com/benmustafademirci/gsc-doctor

Usage
  npx gsc-doctor --demo                       Try it with synthetic data (no account needed)
  npx gsc-doctor --site <property> [options]  Check your own site
  npx gsc-doctor sites                        List the properties your credentials can access

Options
  -s, --site <property>     Search Console property: sc-domain:example.com or https://www.example.com/
      --credentials <file>  Service account key or ADC file (default: GOOGLE_APPLICATION_CREDENTIALS,
                            then gcloud application-default credentials)
      --demo                Use built-in demo data for a fictional site
  -o, --out <file>          HTML report path (default: ./gsc-doctor-report-<site>-<date>.html)
      --json <file>         Also write all findings as JSON
      --config <file>       Thresholds file (default: ./gsc-doctor.config.json if present)
      --brand <terms>       Comma-separated brand terms, excluded from CTR benchmarks
      --days <n>            Days per comparison period (default 28)
      --type <type>         web | image | video | news | discover | googleNews (default web)
      --max-rows <n>        Max rows per Search Console request type and period (default 25000)
      --no-ai               Skip Gemini even if GEMINI_API_KEY is set
      --model <id>          Gemini model (default ${DEFAULT_GEMINI_MODEL}, or GEMINI_MODEL)
      --ai-lang <language>  Language for the AI summary and suggestions (default English)
      --top <n>             Actions shown in the terminal (default 10)
      --open                Open the report in your browser when done
      --no-color            Plain terminal output
  -h, --help                Show this help
  -v, --version             Show the version

Environment
  GEMINI_API_KEY            Enables the optional Gemini summary (also read from ./.env)
  GOOGLE_APPLICATION_CREDENTIALS, GSC_ACCESS_TOKEN, GSC_SITE
`;

class UsageError extends Error {
  override name = 'UsageError';
}

function parseCli(argv: string[]) {
  return parseArgs({
    args: argv,
    allowPositionals: true,
    strict: true,
    options: {
      site: { type: 'string', short: 's' },
      credentials: { type: 'string' },
      demo: { type: 'boolean', default: false },
      out: { type: 'string', short: 'o' },
      json: { type: 'string' },
      config: { type: 'string' },
      brand: { type: 'string' },
      days: { type: 'string' },
      type: { type: 'string' },
      'max-rows': { type: 'string' },
      'no-ai': { type: 'boolean', default: false },
      model: { type: 'string' },
      'ai-lang': { type: 'string' },
      top: { type: 'string' },
      open: { type: 'boolean', default: false },
      'no-color': { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
      version: { type: 'boolean', short: 'v', default: false },
    },
  });
}

function intOption(value: string | undefined, name: string, fallback: number, min: number, max: number): number {
  if (value === undefined) return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) throw new UsageError(`--${name} must be a whole number between ${min} and ${max}.`);
  return n;
}

function loadDotEnv(): void {
  const loader = (process as unknown as { loadEnvFile?: (path?: string) => void }).loadEnvFile;
  if (typeof loader === 'function' && existsSync('.env')) {
    try {
      loader('.env');
    } catch {
      // A malformed .env should not stop the report.
    }
  }
}

function defaultReportPath(siteUrl: string, endDate: string): string {
  const slug = siteLabel(siteUrl).replace(/[^a-z0-9.]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'site';
  return resolve(`gsc-doctor-report-${slug}-${endDate}.html`);
}

function writeFile(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, 'utf8');
}

function displayPath(path: string): string {
  const rel = relative(process.cwd(), path);
  return rel && !rel.startsWith('..') ? rel : path;
}

async function resolveSite(client: GscClient, input: string, log: (s: string) => void): Promise<string> {
  let sites: string[];
  try {
    sites = (await client.listSites()).map((s) => s.siteUrl);
  } catch {
    return input; // Listing is a convenience; the query itself will report real problems.
  }
  if (sites.length === 0) return input;
  const { match, candidates } = matchSite(input, sites);
  if (match) {
    if (match !== input) log(`Using property ${match}`);
    return match;
  }
  throw new UsageError(
    `"${input}" is not among the properties these credentials can access${candidates.length ? '' : ''}:\n` +
      sites.map((s) => `  ${s}`).join('\n'),
  );
}

async function runSites(values: ReturnType<typeof parseCli>['values'], c: Colors): Promise<void> {
  const auth = resolveAuth({ credentialsPath: values.credentials });
  const client = new GscClient(auth);
  const sites = await client.listSites();
  console.log(c.dim(`Authenticated as ${auth.description}`));
  if (sites.length === 0) {
    console.log('No properties found. Add this account as a user in Search Console (Settings → Users and permissions).');
    return;
  }
  for (const s of sites.sort((a, b) => a.siteUrl.localeCompare(b.siteUrl))) {
    console.log(`  ${s.siteUrl.padEnd(48)} ${c.dim(s.permissionLevel)}`);
  }
}

async function runReport(values: ReturnType<typeof parseCli>['values'], c: Colors): Promise<void> {
  const log = (message: string) => process.stderr.write(`${c.dim(message)}\n`);
  const days = intOption(values.days, 'days', 28, 7, 240);
  const top = intOption(values.top, 'top', 10, 1, 100);
  const maxRows = intOption(values['max-rows'], 'max-rows', 25_000, 1000, 1_000_000);
  const searchType = (values.type ?? 'web') as SearchType;
  if (!SEARCH_TYPES.includes(searchType)) throw new UsageError(`--type must be one of: ${SEARCH_TYPES.join(', ')}.`);

  const fileConfig = loadConfigFile(values.config);
  const cliBrand = values.brand?.split(',').map((s) => s.trim()).filter(Boolean);
  const demoDefaults: PartialConfig | undefined = values.demo && !cliBrand && !fileConfig?.brandTerms ? { brandTerms: DEMO_BRAND_TERMS } : undefined;
  const config = resolveConfig(demoDefaults, fileConfig, cliBrand ? { brandTerms: cliBrand } : undefined);

  const started = Date.now();
  let dataset: Dataset;
  if (values.demo) {
    dataset = generateDemoDataset({ days });
  } else {
    const siteInput = values.site ?? process.env.GSC_SITE;
    if (!siteInput) {
      throw new UsageError('Missing --site. Example: npx gsc-doctor --site sc-domain:example.com\nNo account yet? Try: npx gsc-doctor --demo');
    }
    const auth = resolveAuth({ credentialsPath: values.credentials });
    log(`Authenticating with ${auth.description}`);
    const client = new GscClient(auth);
    const siteUrl = await resolveSite(client, siteInput, log);
    dataset = await fetchDataset(client, { siteUrl, searchType, days, maxRows, onProgress: log });
    log(`Fetched ${dataset.current.queryPages.length + dataset.previous.queryPages.length} query/page rows in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  }

  const diagnosis = diagnose(dataset, config);

  // Optional AI layer.
  let ai: AiInsights | undefined;
  let aiError: string | undefined;
  let aiNote: string | undefined;
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (apiKey && !values['no-ai']) {
    const model = values.model ?? process.env.GEMINI_MODEL ?? DEFAULT_GEMINI_MODEL;
    log(`Asking Gemini (${model}) for a summary…`);
    try {
      const livePages = diagnosis.lowCtr.slice(0, 5).map((f) => f.page).filter((p) => !diagnosis.pageMeta[p]);
      const fetched = dataset.source === 'gsc' ? await fetchPageMeta(livePages) : {};
      diagnosis.pageMeta = { ...fetched, ...diagnosis.pageMeta };
      ai = await generateInsights(diagnosis, diagnosis.pageMeta, { apiKey, model, language: values['ai-lang'] });
    } catch (error) {
      aiError = (error as Error).message;
      aiNote = `Gemini step skipped: ${aiError}. The report is complete without it.`;
    }
  } else if (values.demo && !values['no-ai']) {
    const flagged = new Set(diagnosis.lowCtr.map((f) => f.page));
    ai = { ...DEMO_SAMPLE_AI, titleSuggestions: DEMO_SAMPLE_AI.titleSuggestions.filter((s) => flagged.has(s.page)) };
    aiNote = 'The report includes a sample AI section. Set GEMINI_API_KEY to generate it live with Gemini.';
  } else if (!apiKey && !values['no-ai']) {
    aiNote = 'Tip: set GEMINI_API_KEY to add a plain-language summary and title suggestions written by Gemini.';
  }

  const html = renderReport(diagnosis, { version: VERSION, config, ai, aiError, aiConfigured: !!apiKey });
  const outPath = values.out ? resolve(values.out) : defaultReportPath(diagnosis.siteUrl, diagnosis.current.end);
  writeFile(outPath, html);
  if (values.json) {
    writeFile(resolve(values.json), `${JSON.stringify({ version: VERSION, diagnosis, ai: ai ?? null }, null, 2)}\n`);
  }

  console.log(renderTerminal(diagnosis, { colors: c, top, width: process.stdout.columns, ai, aiNote }));
  console.log('');
  console.log(`${c.green('✔')} Report saved: ${c.bold(displayPath(outPath))} ${c.dim(`(${(Date.now() - started) / 1000 < 1 ? '<1' : ((Date.now() - started) / 1000).toFixed(1)}s)`)}`);
  if (values.json) console.log(`${c.green('✔')} JSON saved: ${displayPath(resolve(values.json))}`);
  if (values.open) openFile(outPath);
  else console.log(c.dim('  Open it in any browser, or re-run with --open.'));
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<number> {
  loadDotEnv();
  let values: ReturnType<typeof parseCli>['values'];
  let positionals: string[];
  try {
    ({ values, positionals } = parseCli(argv));
  } catch (error) {
    process.stderr.write(`${(error as Error).message}\nRun gsc-doctor --help for usage.\n`);
    return 2;
  }
  const c = createColors(colorEnabled(process.stdout, process.env, values['no-color']));
  const errC = createColors(colorEnabled(process.stderr, process.env, values['no-color']));

  if (values.help) {
    console.log(HELP);
    return 0;
  }
  if (values.version) {
    console.log(VERSION);
    return 0;
  }

  const command = positionals[0] ?? 'report';
  try {
    if (command === 'sites') await runSites(values, c);
    else if (command === 'report') await runReport(values, c);
    else throw new UsageError(`Unknown command "${command}". Run gsc-doctor --help.`);
    return 0;
  } catch (error) {
    const err = error as Error & { hint?: string };
    process.stderr.write(`\n${errC.red('✖')} ${err.message}\n`);
    if (err instanceof AuthError || err instanceof GscApiError) {
      if (err.hint) process.stderr.write(`\n${err.hint}\n`);
    } else if (!(err instanceof UsageError || err instanceof ConfigError || err instanceof NoDataError)) {
      process.stderr.write(`${errC.dim(err.stack ?? '')}\n`);
    }
    return err instanceof UsageError ? 2 : 1;
  }
}
