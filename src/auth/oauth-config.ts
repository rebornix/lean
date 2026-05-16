/**
 * Configuration constants for the OAuth flow.
 *
 * The `client_id` is public (PKCE means we ship no secret). It can be
 * overridden via `LEAN_OAUTH_CLIENT_ID` for development and CI.
 */

const DEFAULT_CLIENT_ID = "__lean_oauth_client_id_not_registered__";

export const OAUTH_AUTHORIZE_URL = "https://linear.app/oauth/authorize";
export const OAUTH_TOKEN_URL = "https://api.linear.app/oauth/token";
export const OAUTH_REVOKE_URL = "https://api.linear.app/oauth/revoke";

/** Fixed loopback port. Linear requires every redirect URI to be
 * registered exactly; one port keeps configuration simple. */
export const OAUTH_REDIRECT_PORT = 53682;
export const OAUTH_REDIRECT_URI = `http://127.0.0.1:${OAUTH_REDIRECT_PORT}/callback`;

export const DEFAULT_SCOPE = "read,write";

export function getClientId(): string {
  const fromEnv = process.env.LEAN_OAUTH_CLIENT_ID;
  if (fromEnv && fromEnv.length > 0) {
    return fromEnv;
  }
  return DEFAULT_CLIENT_ID;
}

export function isClientIdConfigured(): boolean {
  return getClientId() !== DEFAULT_CLIENT_ID;
}
