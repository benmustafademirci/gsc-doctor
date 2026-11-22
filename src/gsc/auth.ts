/**
 * Google OAuth 2.0 for server-to-server and local use, with zero dependencies.
 *
 * Supported credentials, checked in this order:
 *  1. GSC_ACCESS_TOKEN — a ready-made access token (e.g. from
 *     `gcloud auth print-access-token` or a CI step). Used as-is.
 *  2. --credentials <file> or GOOGLE_APPLICATION_CREDENTIALS — a service
 *     account key (recommended) or an "authorized_user" ADC file.
 *  3. The gcloud Application Default Credentials file created by
 *     `gcloud auth application-default login`.
 *
 * Service accounts use the JWT bearer flow documented at
 * https://developers.google.com/identity/protocols/oauth2/service-account#httprest
 */
import { createSign } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

export const GSC_SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';
const DEFAULT_TOKEN_URI = 'https://oauth2.googleapis.com/token';
/** Refresh tokens this long before they expire. */
const EXPIRY_MARGIN_MS = 60_000;

export class AuthError extends Error {
  override name = 'AuthError';
  constructor(message: string, readonly hint?: string) {
    super(message);
  }
}

export interface AuthProvider {
  /** Human-readable description, e.g. "service account gsc@project.iam.gserviceaccount.com". */
  readonly description: string;
  /** Email of the identity, when known (used in permission hints). */
  readonly principal?: string;
  getHeaders(): Promise<Record<string, string>>;
}

interface ServiceAccountKey {
  type: 'service_account';
  client_email: string;
  private_key: string;
  private_key_id?: string;
  token_uri?: string;
  project_id?: string;
}

interface AuthorizedUser {
  type: 'authorized_user';
  client_id: string;
  client_secret: string;
  refresh_token: string;
  quota_project_id?: string;
  account?: string;
}

type FetchLike = typeof fetch;

export interface ResolveAuthOptions {
  credentialsPath?: string;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: FetchLike;
  /** Overrides where the gcloud ADC file is looked up (tests). */
  gcloudAdcPath?: string;
  now?: () => number;
}

const base64url = (input: string | Buffer) => Buffer.from(input).toString('base64url');

/** Builds the signed JWT assertion for the service-account token request. */
export function createServiceAccountAssertion(key: ServiceAccountKey, scope: string, nowSeconds: number): string {
  const header: Record<string, string> = { alg: 'RS256', typ: 'JWT' };
  if (key.private_key_id) header.kid = key.private_key_id;
  const claims = {
    iss: key.client_email,
    scope,
    aud: key.token_uri ?? DEFAULT_TOKEN_URI,
    iat: nowSeconds,
    exp: nowSeconds + 3600,
  };
  const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claims))}`;
  const signature = createSign('RSA-SHA256').update(unsigned).sign(key.private_key);
  return `${unsigned}.${base64url(signature)}`;
}

async function requestToken(fetchImpl: FetchLike, url: string, params: Record<string, string>): Promise<{ token: string; expiresIn: number }> {
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params).toString(),
    });
  } catch (error) {
    throw new AuthError(`Could not reach Google's token endpoint: ${(error as Error).message}`, 'Check your internet connection or proxy settings.');
  }
  const body = (await response.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };
  if (!response.ok || !body.access_token) {
    const reason = body.error_description ?? body.error ?? `HTTP ${response.status}`;
    const hint =
      body.error === 'invalid_grant'
        ? 'The key or refresh token was rejected. It may have been deleted or expired, or your system clock is off. Create a new key or log in again.'
        : body.error === 'invalid_client'
          ? 'The OAuth client in your credentials file is invalid or was deleted.'
          : undefined;
    throw new AuthError(`Google refused the credentials: ${reason}`, hint);
  }
  return { token: body.access_token, expiresIn: body.expires_in ?? 3600 };
}

/** Caches an access token until shortly before it expires. */
function cachedTokenProvider(
  description: string,
  principal: string | undefined,
  mint: () => Promise<{ token: string; expiresIn: number }>,
  now: () => number,
  extraHeaders: Record<string, string> = {},
): AuthProvider {
  let cache: { token: string; expiresAt: number } | undefined;
  let pending: Promise<string> | undefined;
  const getToken = async () => {
    if (cache && cache.expiresAt - EXPIRY_MARGIN_MS > now()) return cache.token;
    pending ??= mint()
      .then(({ token, expiresIn }) => {
        cache = { token, expiresAt: now() + expiresIn * 1000 };
        return token;
      })
      .finally(() => {
        pending = undefined;
      });
    return pending;
  };
  return {
    description,
    principal,
    async getHeaders() {
      return { authorization: `Bearer ${await getToken()}`, ...extraHeaders };
    },
  };
}

export function gcloudAdcPath(env: NodeJS.ProcessEnv = process.env): string {
  if (env.CLOUDSDK_CONFIG) return join(env.CLOUDSDK_CONFIG, 'application_default_credentials.json');
  if (process.platform === 'win32' && env.APPDATA) return join(env.APPDATA, 'gcloud', 'application_default_credentials.json');
  return join(homedir(), '.config', 'gcloud', 'application_default_credentials.json');
}

function readCredentialsFile(path: string): unknown {
  if (!existsSync(path)) throw new AuthError(`Credentials file not found: ${path}`);
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new AuthError(`Could not read credentials file ${path}: ${(error as Error).message}`);
  }
}

export function providerFromCredentials(
  json: unknown,
  source: string,
  fetchImpl: FetchLike,
  now: () => number,
): AuthProvider {
  const creds = json as Partial<Omit<ServiceAccountKey, 'type'> & Omit<AuthorizedUser, 'type'>> & { type?: string };
  if (creds.type === 'service_account') {
    if (!creds.client_email || !creds.private_key) throw new AuthError(`${source} is missing client_email or private_key.`);
    const key = creds as ServiceAccountKey;
    return cachedTokenProvider(
      `service account ${key.client_email}`,
      key.client_email,
      () =>
        requestToken(fetchImpl, key.token_uri ?? DEFAULT_TOKEN_URI, {
          grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
          assertion: createServiceAccountAssertion(key, GSC_SCOPE, Math.floor(now() / 1000)),
        }),
      now,
    );
  }
  if (creds.type === 'authorized_user') {
    if (!creds.client_id || !creds.client_secret || !creds.refresh_token) {
      throw new AuthError(`${source} is missing client_id, client_secret or refresh_token.`);
    }
    const user = creds as AuthorizedUser;
    // User credentials bill API usage to a "quota project" (x-goog-user-project).
    const headers: Record<string, string> = user.quota_project_id ? { 'x-goog-user-project': user.quota_project_id } : {};
    return cachedTokenProvider(
      `user credentials (${source})`,
      user.account,
      () =>
        requestToken(fetchImpl, DEFAULT_TOKEN_URI, {
          grant_type: 'refresh_token',
          client_id: user.client_id,
          client_secret: user.client_secret,
          refresh_token: user.refresh_token,
        }),
      now,
      headers,
    );
  }
  throw new AuthError(
    `Credentials of type "${creds.type ?? 'unknown'}" in ${source} are not supported yet.`,
    'Use a service account key, gcloud Application Default Credentials, or set GSC_ACCESS_TOKEN to an access token with the webmasters.readonly scope.',
  );
}

export const SETUP_HINT =
  'Set up access in ~5 minutes: create a service account, add its email as a user in Search Console, then run\n' +
  '  npx gsc-doctor --site sc-domain:your-site.com --credentials ./service-account.json\n' +
  'Step-by-step guide: https://github.com/benmustafademirci/gsc-doctor#connect-search-console\n' +
  'Just want to look first? Run: npx gsc-doctor --demo';

export function resolveAuth(options: ResolveAuthOptions = {}): AuthProvider {
  const env = options.env ?? process.env;
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? Date.now;

  const staticToken = env.GSC_ACCESS_TOKEN?.trim();
  if (staticToken) {
    return {
      description: 'access token from GSC_ACCESS_TOKEN',
      async getHeaders() {
        return { authorization: `Bearer ${staticToken}` };
      },
    };
  }

  const explicit = options.credentialsPath ?? env.GOOGLE_APPLICATION_CREDENTIALS;
  if (explicit) {
    const path = resolve(explicit);
    return providerFromCredentials(readCredentialsFile(path), path, fetchImpl, now);
  }

  const adc = options.gcloudAdcPath ?? gcloudAdcPath(env);
  if (existsSync(adc)) return providerFromCredentials(readCredentialsFile(adc), 'gcloud application-default credentials', fetchImpl, now);

  throw new AuthError('No Google credentials found.', SETUP_HINT);
}
