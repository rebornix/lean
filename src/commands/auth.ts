import type { Command } from "commander";
import { getClient } from "../api/client.js";
import {
  getCredentials,
  saveOAuthCredentials,
  saveApiKey,
  clearAllCredentials,
  revokeToken,
} from "../auth/credentials.js";
import { readConfig } from "../config/index.js";
import { LeanError } from "../errors.js";
import { loginInteractive, loginOobStart, loginOobComplete } from "../auth/oauth-flow.js";

interface LoginOpts {
  apiKey?: string;
  oauth?: boolean;
  oob?: boolean;
  complete?: boolean;
  code?: string;
  state?: string;
  codeVerifier?: string;
  scope?: string;
  json?: boolean;
}

export function registerAuthCommands(auth: Command): void {
  auth
    .command("login")
    .description("Authenticate with Linear")
    .option("--api-key <key>", "Provide a Personal API Key non-interactively")
    .option("--oauth", "Force the OAuth flow (default in a TTY)")
    .option("--oob", "Use the out-of-band OAuth flow (no local server)")
    .option("--complete", "Finish a previously started OOB flow (requires --code, --state, --code-verifier)")
    .option("--code <code>", "Authorization code returned by Linear (for --complete)")
    .option("--state <state>", "State value from the OOB start (for --complete)")
    .option("--code-verifier <verifier>", "PKCE verifier from the OOB start (for --complete)")
    .option("--scope <scope>", "Comma-separated OAuth scopes")
    .option("--json", "Emit machine-readable JSON")
    .action(async (opts: LoginOpts) => {
      await runLogin(opts);
    });

  auth
    .command("status")
    .description("Show current authentication status")
    .option("--json", "Emit machine-readable JSON")
    .action(async (opts: { json?: boolean }) => {
      await runStatus(opts);
    });

  auth
    .command("logout")
    .description("Remove stored credentials and best-effort revoke OAuth tokens")
    .option("--json", "Emit machine-readable JSON")
    .action(async (opts: { json?: boolean }) => {
      await runLogout(opts);
    });
}

async function runLogin(opts: LoginOpts): Promise<void> {
  // Headless API-key path.
  if (opts.apiKey) {
    saveApiKey(opts.apiKey);
    if (opts.json) {
      process.stdout.write(JSON.stringify({ ok: true, auth: { type: "api_key" } }) + "\n");
    } else {
      console.log("API key saved.");
    }
    return;
  }

  // OOB completion path: agent has the code, exchange it.
  if (opts.complete) {
    if (!opts.code || !opts.codeVerifier) {
      throw new LeanError(
        "missing_required_flag",
        "--complete requires --code and --code-verifier (and --state if you started with one)"
      );
    }
    const completedCredentials = await loginOobComplete({
      code: opts.code,
      state: opts.state ?? "",
      expectedState: opts.state,
      codeVerifier: opts.codeVerifier,
    });
    saveOAuthCredentials(completedCredentials);
    const completedClient = await getClient();
    const completedViewer = await completedClient.viewer;
    if (opts.json) {
      process.stdout.write(
        JSON.stringify({
          ok: true,
          auth: { type: "oauth", scope: completedCredentials.scope },
          user: { id: completedViewer.id, name: completedViewer.name, email: completedViewer.email },
        }) + "\n"
      );
    } else {
      console.log(`Logged in as ${completedViewer.name} (${completedViewer.email}).`);
    }
    return;
  }

  // OOB start path: non-TTY or --oob explicitly.
  const wantOob = opts.oob === true || !process.stdin.isTTY;
  if (wantOob) {
    const flow = loginOobStart({ scope: opts.scope });
    const payload = {
      auth_url: flow.authUrl,
      state: flow.state,
      code_verifier: flow.codeVerifier,
      next: "Open auth_url, authorize Linear, copy the displayed code, then run: lean auth login --complete --code <code> --state <state> --code-verifier <verifier>",
    };
    process.stdout.write(JSON.stringify(payload, null, 2) + "\n");
    return;
  }

  // Interactive TTY path: loopback flow.
  const credentials = await loginInteractive({ scope: opts.scope });
  saveOAuthCredentials(credentials);
  const client = await getClient();
  const viewer = await client.viewer;
  if (opts.json) {
    process.stdout.write(
      JSON.stringify({
        ok: true,
        auth: { type: "oauth", scope: credentials.scope },
        user: { id: viewer.id, name: viewer.name, email: viewer.email },
      }) + "\n"
    );
  } else {
    console.log(`Logged in as ${viewer.name} (${viewer.email}).`);
  }
}

async function runStatus(opts: { json?: boolean }): Promise<void> {
  const creds = await getCredentials(); // throws auth_required if none
  const client = await getClient();
  const viewer = await client.viewer;

  if (opts.json) {
    const auth =
      creds.kind === "oauth"
        ? {
            type: "oauth" as const,
            ...(creds.scope ? { scope: creds.scope } : {}),
            ...(creds.expiresAt ? { expires_at: creds.expiresAt } : {}),
          }
        : { type: "api_key" as const };
    process.stdout.write(
      JSON.stringify({ user: { id: viewer.id, name: viewer.name, email: viewer.email }, auth }, null, 2) + "\n"
    );
    return;
  }

  console.log(`Logged in as: ${viewer.name} (${viewer.email})`);
  if (creds.kind === "oauth") {
    const scope = creds.scope ?? "";
    console.log(`Auth: OAuth${scope ? ` (scope: ${scope})` : ""}`);
  } else {
    console.log("Auth: API key");
  }
}

async function runLogout(opts: { json?: boolean }): Promise<void> {
  const config = readConfig();
  const tokenToRevoke = config.oauth?.access_token;
  clearAllCredentials();
  if (tokenToRevoke) {
    await revokeToken(tokenToRevoke);
  }
  if (opts.json) {
    process.stdout.write(JSON.stringify({ ok: true }) + "\n");
  } else {
    console.log("Logged out.");
  }
}
