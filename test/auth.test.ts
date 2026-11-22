import { createVerify, generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { AuthError, GSC_SCOPE, createServiceAccountAssertion, resolveAuth } from '../src/gsc/auth.js';

// A throwaway key generated for the test run; it is never sent anywhere.
const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});

const serviceAccount = {
  type: 'service_account',
  client_email: 'reporter@demo-project.iam.gserviceaccount.com',
  private_key: privateKey,
  private_key_id: 'test-key-id',
};

const dir = mkdtempSync(join(tmpdir(), 'gsc-doctor-auth-'));
function writeJson(name: string, value: unknown): string {
  const path = join(dir, name);
  writeFileSync(path, JSON.stringify(value));
  return path;
}

const tokenResponse = (token: string, expiresIn = 3600) =>
  new Response(JSON.stringify({ access_token: token, expires_in: expiresIn, token_type: 'Bearer' }), { status: 200 });

const missingAdc = join(dir, 'no-adc.json');

describe('createServiceAccountAssertion', () => {
  it('builds an RS256 JWT with the right claims and a valid signature', () => {
    const jwt = createServiceAccountAssertion(serviceAccount as never, GSC_SCOPE, 1_700_000_000);
    const [header, claims, signature] = jwt.split('.');
    expect(JSON.parse(Buffer.from(header!, 'base64url').toString())).toEqual({ alg: 'RS256', typ: 'JWT', kid: 'test-key-id' });
    expect(JSON.parse(Buffer.from(claims!, 'base64url').toString())).toEqual({
      iss: serviceAccount.client_email,
      scope: GSC_SCOPE,
      aud: 'https://oauth2.googleapis.com/token',
      iat: 1_700_000_000,
      exp: 1_700_003_600,
    });
    const valid = createVerify('RSA-SHA256').update(`${header}.${claims}`).verify(publicKey, Buffer.from(signature!, 'base64url'));
    expect(valid).toBe(true);
  });
});

describe('resolveAuth', () => {
  it('prefers GSC_ACCESS_TOKEN', async () => {
    const auth = resolveAuth({ env: { GSC_ACCESS_TOKEN: 'ya29.test' }, gcloudAdcPath: missingAdc });
    expect(await auth.getHeaders()).toEqual({ authorization: 'Bearer ya29.test' });
  });

  it('exchanges a service account key for a token and caches it', async () => {
    const fetchImpl = vi.fn(async () => tokenResponse('sa-token'));
    let clock = 1_700_000_000_000;
    const auth = resolveAuth({
      credentialsPath: writeJson('sa.json', serviceAccount),
      env: {},
      fetchImpl: fetchImpl as never,
      now: () => clock,
    });
    expect(auth.principal).toBe(serviceAccount.client_email);
    expect(await auth.getHeaders()).toEqual({ authorization: 'Bearer sa-token' });
    await auth.getHeaders();
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://oauth2.googleapis.com/token');
    const body = new URLSearchParams(String(init.body));
    expect(body.get('grant_type')).toBe('urn:ietf:params:oauth:grant-type:jwt-bearer');
    expect(body.get('assertion')?.split('.')).toHaveLength(3);

    clock += 3600 * 1000; // expired → refresh
    await auth.getHeaders();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('reads GOOGLE_APPLICATION_CREDENTIALS', async () => {
    const fetchImpl = vi.fn(async () => tokenResponse('env-token'));
    const auth = resolveAuth({ env: { GOOGLE_APPLICATION_CREDENTIALS: writeJson('env-sa.json', serviceAccount) }, fetchImpl: fetchImpl as never });
    expect(await auth.getHeaders()).toEqual({ authorization: 'Bearer env-token' });
  });

  it('refreshes authorized_user credentials and sends the quota project', async () => {
    const fetchImpl = vi.fn(async () => tokenResponse('user-token'));
    const adc = writeJson('adc.json', {
      type: 'authorized_user',
      client_id: 'client.apps.googleusercontent.com',
      client_secret: 'not-a-real-secret',
      refresh_token: 'refresh-me',
      quota_project_id: 'demo-project',
    });
    const auth = resolveAuth({ env: {}, gcloudAdcPath: adc, fetchImpl: fetchImpl as never });
    expect(await auth.getHeaders()).toEqual({ authorization: 'Bearer user-token', 'x-goog-user-project': 'demo-project' });
    const body = new URLSearchParams(String((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(body.get('grant_type')).toBe('refresh_token');
    expect(body.get('refresh_token')).toBe('refresh-me');
  });

  it('turns token errors into helpful AuthErrors', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ error: 'invalid_grant', error_description: 'Invalid JWT Signature.' }), { status: 400 }));
    const auth = resolveAuth({ credentialsPath: writeJson('bad.json', serviceAccount), env: {}, fetchImpl: fetchImpl as never });
    await expect(auth.getHeaders()).rejects.toMatchObject({ name: 'AuthError', message: expect.stringContaining('Invalid JWT Signature') });
  });

  it('rejects unsupported credential types and missing credentials', () => {
    expect(() => resolveAuth({ credentialsPath: writeJson('ext.json', { type: 'external_account' }), env: {} })).toThrow(/not supported/);
    expect(() => resolveAuth({ env: {}, gcloudAdcPath: missingAdc })).toThrow(AuthError);
    expect(() => resolveAuth({ credentialsPath: join(dir, 'missing.json'), env: {} })).toThrow(/not found/);
  });
});
