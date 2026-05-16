import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { spawn } from "node:child_process";
import { LeanError } from "../errors.js";
import {
  DEFAULT_SCOPE,
  OAUTH_AUTHORIZE_URL,
  OAUTH_REDIRECT_PORT,
  OAUTH_REDIRECT_URI,
  getClientId,
  isClientIdConfigured,
} from "./oauth-config.js";
import { challengeFor, generateState, generateVerifier } from "./pkce.js";
import { exchangeAuthorizationCode } from "./credentials.js";
import type { OAuthCredentials } from "../config/index.js";

const LOOPBACK_TIMEOUT_MS = 120_000;

interface FlowParams {
  scope?: string;
}

export interface OobStart {
  authUrl: string;
  state: string;
  codeVerifier: string;
}

function ensureClientId(): void {
  if (!isClientIdConfigured()) {
    throw new LeanError(
      "invalid_argument",
      "OAuth client ID is not configured. The OAuth app for @rebornix/lean has not been registered with Linear yet.",
      {
        action:
          "Register an OAuth app at https://linear.app/settings/api/applications and set LEAN_OAUTH_CLIENT_ID; see Specs/007-oauth.md for details.",
      }
    );
  }
}

function buildAuthorizeUrl(args: { state: string; challenge: string; scope: string }): string {
  const url = new URL(OAUTH_AUTHORIZE_URL);
  url.searchParams.set("client_id", getClientId());
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", OAUTH_REDIRECT_URI);
  url.searchParams.set("scope", args.scope);
  url.searchParams.set("state", args.state);
  url.searchParams.set("code_challenge", args.challenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("actor", "user");
  return url.toString();
}

/** Begin an OOB (out-of-band) login. Returns the URL the user should
 * open and the PKCE / state values they will need to complete it. */
export function loginOobStart(params: FlowParams = {}): OobStart {
  ensureClientId();
  const codeVerifier = generateVerifier();
  const state = generateState();
  const challenge = challengeFor(codeVerifier);
  const scope = params.scope ?? DEFAULT_SCOPE;
  const authUrl = buildAuthorizeUrl({ state, challenge, scope });
  return { authUrl, state, codeVerifier };
}

export interface OobCompleteArgs {
  code: string;
  state: string;
  expectedState?: string;
  codeVerifier: string;
}

export async function loginOobComplete(args: OobCompleteArgs): Promise<OAuthCredentials> {
  if (args.expectedState !== undefined && args.expectedState !== args.state) {
    throw new LeanError("invalid_argument", "OAuth state mismatch (possible CSRF)");
  }
  return exchangeAuthorizationCode({
    code: args.code,
    redirectUri: OAUTH_REDIRECT_URI,
    codeVerifier: args.codeVerifier,
  });
}

/** Drive the full loopback flow: spawn server, open browser, capture
 * the redirect, exchange the code. */
export async function loginInteractive(params: FlowParams = {}): Promise<OAuthCredentials> {
  ensureClientId();
  const codeVerifier = generateVerifier();
  const state = generateState();
  const challenge = challengeFor(codeVerifier);
  const scope = params.scope ?? DEFAULT_SCOPE;
  const authUrl = buildAuthorizeUrl({ state, challenge, scope });

  const code = await captureCodeOnLoopback({ expectedState: state, openUrl: authUrl });
  return exchangeAuthorizationCode({
    code,
    redirectUri: OAUTH_REDIRECT_URI,
    codeVerifier,
  });
}

interface CaptureArgs {
  expectedState: string;
  openUrl: string;
}

function captureCodeOnLoopback(args: CaptureArgs): Promise<string> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    let settled = false;

    const settle = (fn: () => void): void => {
      if (settled) {
        return;
      }
      settled = true;
      fn();
      server.close();
    };

    server.on("request", (req: IncomingMessage, res: ServerResponse) => {
      const url = new URL(req.url ?? "/", `http://127.0.0.1:${OAUTH_REDIRECT_PORT}`);
      if (url.pathname !== "/callback") {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("Not found");
        return;
      }
      const params = url.searchParams;
      const code = params.get("code");
      const state = params.get("state");
      const error = params.get("error");
      if (error) {
        res.writeHead(400, { "Content-Type": "text/html" });
        res.end(`<h1>Authorization failed</h1><p>${escapeHtml(error)}</p>`);
        settle(() => reject(new LeanError("auth_invalid", `OAuth authorization failed: ${error}`)));
        return;
      }
      if (!state || state !== args.expectedState) {
        res.writeHead(400, { "Content-Type": "text/plain" });
        res.end("State mismatch");
        settle(() => reject(new LeanError("invalid_argument", "OAuth state mismatch (possible CSRF)")));
        return;
      }
      if (!code) {
        res.writeHead(400, { "Content-Type": "text/plain" });
        res.end("Missing code");
        settle(() => reject(new LeanError("auth_invalid", "OAuth callback missing code")));
        return;
      }
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(
        `<!doctype html><meta charset="utf-8"><title>lean</title>` +
          `<body style="font-family:system-ui;text-align:center;padding:4rem">` +
          `<h1>Logged in</h1><p>You can close this tab and return to your terminal.</p>` +
          `</body>`
      );
      settle(() => resolve(code));
    });

    server.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") {
        settle(() =>
          reject(
            new LeanError(
              "invalid_argument",
              `Port ${OAUTH_REDIRECT_PORT} is already in use; cannot capture the OAuth callback`,
              { action: "Stop the process using that port, or use --oob for the out-of-band flow" }
            )
          )
        );
        return;
      }
      settle(() => reject(err));
    });

    const timer = setTimeout(() => {
      settle(() =>
        reject(
          new LeanError(
            "invalid_argument",
            `Timed out after ${LOOPBACK_TIMEOUT_MS / 1000}s waiting for the OAuth callback`
          )
        )
      );
    }, LOOPBACK_TIMEOUT_MS);
    timer.unref();

    server.listen(OAUTH_REDIRECT_PORT, "127.0.0.1", () => {
      openBrowser(args.openUrl);
    });
  });
}

function openBrowser(url: string): void {
  const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
  try {
    const child = spawn(cmd, [url], { stdio: "ignore", detached: true });
    child.on("error", () => {
      // ignore: if the browser can't be opened, the user can paste the URL by hand
    });
    child.unref();
  } catch {
    // ignore
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[<>&"']/g, c =>
    c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === "&" ? "&amp;" : c === '"' ? "&quot;" : "&#39;"
  );
}
