import { readConfig, writeConfig, type OAuthCredentials } from "../config/index.js";
import { LeanError } from "../errors.js";
import { OAUTH_TOKEN_URL, getClientId } from "./oauth-config.js";

export type Credentials =
  | { kind: "oauth"; token: string; scope?: string; expiresAt?: string }
  | { kind: "api_key"; token: string };

const REFRESH_BUFFER_MS = 60_000;

/**
 * Resolve which credentials to send to Linear, in spec order:
 *
 *   1. env LINEAR_ACCESS_TOKEN  (Bearer)
 *   2. env LINEAR_API_KEY
 *   3. config.oauth.access_token  (refresh transparently if expired)
 *   4. config.apiKey
 *
 * Throws `auth_required` when no credentials are present anywhere.
 */
export async function getCredentials(): Promise<Credentials> {
  const envAccess = process.env.LINEAR_ACCESS_TOKEN;
  if (envAccess && envAccess.length > 0) {
    return { kind: "oauth", token: envAccess };
  }

  const envApiKey = process.env.LINEAR_API_KEY;
  if (envApiKey && envApiKey.length > 0) {
    return { kind: "api_key", token: envApiKey };
  }

  const config = readConfig();
  if (config.oauth) {
    const refreshed = await ensureFresh(config.oauth);
    return {
      kind: "oauth",
      token: refreshed.access_token,
      scope: refreshed.scope,
      ...(refreshed.expires_at ? { expiresAt: refreshed.expires_at } : {}),
    };
  }

  if (config.apiKey && config.apiKey.length > 0) {
    return { kind: "api_key", token: config.apiKey };
  }

  throw new LeanError("auth_required", "No API key configured", {
    action: "Run `lean auth login` or set LINEAR_API_KEY",
  });
}

export function saveOAuthCredentials(creds: OAuthCredentials): void {
  const config = readConfig();
  writeConfig({ ...config, oauth: creds });
}

export function saveApiKey(apiKey: string): void {
  const config = readConfig();
  writeConfig({ ...config, apiKey });
}

export function clearAllCredentials(): void {
  const config = readConfig();
  const next = { ...config };
  delete next.apiKey;
  delete next.oauth;
  writeConfig(next);
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
}

async function ensureFresh(oauth: OAuthCredentials): Promise<OAuthCredentials> {
  if (!oauth.expires_at || !oauth.refresh_token) {
    return oauth;
  }
  const expiresAt = Date.parse(oauth.expires_at);
  if (Number.isNaN(expiresAt) || expiresAt - Date.now() > REFRESH_BUFFER_MS) {
    return oauth;
  }
  const refreshed = await refreshAccessToken(oauth.refresh_token);
  const updated = mergeRefreshed(oauth, refreshed);
  saveOAuthCredentials(updated);
  return updated;
}

async function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: getClientId(),
  });
  const res = await fetch(OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    throw new LeanError("auth_invalid", `OAuth refresh failed (HTTP ${res.status})`, {
      action: "Run `lean auth login` to re-authenticate",
    });
  }
  return (await res.json()) as TokenResponse;
}

function mergeRefreshed(prev: OAuthCredentials, fresh: TokenResponse): OAuthCredentials {
  return {
    access_token: fresh.access_token,
    refresh_token: fresh.refresh_token ?? prev.refresh_token,
    scope: fresh.scope ?? prev.scope,
    obtained_at: new Date().toISOString(),
    ...(fresh.expires_in ? { expires_at: new Date(Date.now() + fresh.expires_in * 1000).toISOString() } : {}),
  };
}

/** Exchange a code (from a successful authorization) for a token. */
export async function exchangeAuthorizationCode(args: {
  code: string;
  redirectUri: string;
  codeVerifier: string;
}): Promise<OAuthCredentials> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: args.code,
    redirect_uri: args.redirectUri,
    client_id: getClientId(),
    code_verifier: args.codeVerifier,
  });
  const res = await fetch(OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new LeanError("auth_invalid", `OAuth token exchange failed (HTTP ${res.status}): ${text.slice(0, 200)}`);
  }
  const payload = (await res.json()) as TokenResponse;
  const obtainedAt = new Date();
  return {
    access_token: payload.access_token,
    refresh_token: payload.refresh_token,
    scope: payload.scope ?? "",
    obtained_at: obtainedAt.toISOString(),
    ...(payload.expires_in
      ? { expires_at: new Date(obtainedAt.getTime() + payload.expires_in * 1000).toISOString() }
      : {}),
  };
}

/** Best-effort revoke; never throws. */
export async function revokeToken(token: string): Promise<void> {
  try {
    const body = new URLSearchParams({ token, client_id: getClientId() });
    await fetch("https://api.linear.app/oauth/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
  } catch {
    // ignore; logout always succeeds locally
  }
}
