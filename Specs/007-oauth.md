# 007: OAuth Login

This spec adds an OAuth 2.0 + PKCE login flow to `lean auth login` so
users can authenticate via Linear's hosted authorization page (the same
UX you get from `gh auth login`) instead of pasting a long-lived
Personal API Key. The existing API-key path stays for headless / CI
use, and becomes the documented path for non-interactive automation.

The document has two parts. Section 1 is the **research** that the
design decisions are built on (Linear's actual OAuth surface, plus how
comparable CLIs handle credential storage). Section 2 is the **design
proposal** itself.

---

# Section 1: Research

## Linear OAuth capabilities

| Capability | Supported? | Notes |
|---|---|---|
| Authorization Code Grant | yes | The standard "open browser, get code, exchange for token" flow. |
| PKCE (RFC 7636) | yes (recommended) | Lets us drop `client_secret` entirely — appropriate for native/CLI apps. |
| Refresh tokens | yes | Returned alongside the access token. Access tokens have very long lifetimes (effectively years), so refresh is rarely needed in practice. |
| Loopback redirects (`http://127.0.0.1:<port>` / `http://localhost:<port>`) | yes | But every redirect URI must be **registered explicitly** in the OAuth app config. |
| Wildcard ports / paths in redirect URI | **no** | Cannot register `http://localhost:*/callback`. Each port string is its own URI. |
| Device Authorization Grant (RFC 8628) | **no** | The device-code flow that GitHub, Google, Auth0, etc. expose for input-constrained clients does not exist on Linear. |
| Out-of-band (paste-the-code) flow | yes implicitly | Any registered redirect URI works; `127.0.0.1` redirects can be observed by the user copying the URL out of their browser's address bar. |

## Available scopes

Per Linear's docs, scope strings include `read`, `write`, `admin`,
`issues:create`, `comments:create`. Default-empty scope grants read.

For `lean`'s current command surface (list/view/create/edit/close/
comment), the minimum sufficient scope is `read,write`. We will request
exactly that.

## What the SDK already does

`@linear/sdk`'s `LinearClient` accepts either `apiKey` or `accessToken`.
When `accessToken` is provided, the SDK sends `Authorization: Bearer
<token>` automatically. So once `lean` obtains a token, no further work
on the client side is needed beyond plumbing the credentials helper.

## What other CLIs do

A short, fact-only survey of how comparable CLIs handle OAuth and
credential storage:

- **`gh`**: Browser-based auth-code flow with a short device-code
  fallback (because GitHub supports device flow). Stores credentials in
  the OS keychain via `go-keyring` when one is present, falling back to
  `~/.config/gh/hosts.yml` (plain YAML, `chmod 0600`) on hosts without
  a keychain.
- **`gcloud`**: Authorization-code with loopback. Stores credentials in
  `~/.config/gcloud/credentials.db` (SQLite, plain text).
- **`heroku`**: OAuth in `~/.netrc` (plain text).
- **`vercel`**: OAuth in `~/.local/share/com.vercel.cli/auth.json`
  (plain JSON).
- **`docker login`**: `~/.docker/config.json` (base64) by default;
  optional credential helper (`osxkeychain`, `secretservice`,
  `wincred`, `pass`).

The honest baseline across the ecosystem is **plain JSON in a
user-private file under `~/.config/<name>/`**, with file permissions
(`0600`) as the only at-rest protection. OS-keychain integration is a
nice-to-have, not a baseline. The actual threat model is "your user
account is compromised" — and the keychain is unlocked under your user
too in that scenario, so the encryption is not the protection most
people think it is.

## Constraints this puts on `lean`'s design

1. **Fixed redirect port.** Pick a single high port (the gh choice of
   `53682` is a fine convention) and document that the OAuth app must
   register `http://127.0.0.1:53682/callback` exactly. If the port is
   in use, we surface a clear error and fall back to the OOB pattern.
2. **No device flow.** Headless / agent contexts can't use the tidy
   "go to a URL and enter a code" flow that gh uses. Our equivalent is
   a two-step OOB flow: emit the auth URL + state + verifier as JSON;
   user authorizes; user passes the resulting `code` back to a
   `lean auth login --complete` invocation.
3. **PKCE only.** No `client_secret` ships with the binary. The
   `client_id` is public and is baked into source.
4. **Same SDK code path.** Once we have `access_token`, every existing
   command works unchanged — credentials get plumbed via `accessToken`
   into `LinearClient` instead of `apiKey`.

---

# Section 2: Design

## Decisions captured

1. **Authorization Code Grant + PKCE.** No `client_secret`, no
   server-side proxy, public `client_id` baked into source.
2. **Fixed loopback redirect** at `http://127.0.0.1:53682/callback`.
   That single URI is the only one that needs to be registered in the
   OAuth app. No wildcards, no port juggling.
3. **No device flow.** Linear doesn't expose RFC 8628; we use an
   out-of-band (OOB) "paste the code" flow as the headless equivalent.
4. **OS keychain by default, file fallback.** Mirrors the `gh`
   pattern. Env vars always win.
5. **`accessToken` plumbing via the SDK.** Once we have a token, no
   command needs to change.

## UX

### TTY (human at a terminal)

```
$ lean auth login
Opening https://linear.app/oauth/authorize?... in your browser
(listening on http://127.0.0.1:53682/callback)

Logged in as Peng Lyu (penn.lv@gmail.com).
```

Behind the scenes:
1. Generate PKCE `code_verifier` (32 random bytes, base64url) and
   `code_challenge = base64url(SHA-256(code_verifier))`.
2. Generate `state` (16 random bytes, base64url) for CSRF.
3. Bind a one-shot HTTP server on `127.0.0.1:53682`. If that port is
   busy, error out with `port_busy` and surface the OOB fallback.
4. Open the user's default browser at:
   ```
   https://linear.app/oauth/authorize
     ?client_id=<id>
     &response_type=code
     &redirect_uri=http://127.0.0.1:53682/callback
     &scope=read,write
     &state=<state>
     &code_challenge=<challenge>
     &code_challenge_method=S256
     &actor=user
   ```
5. The callback handler validates `state`, sends a small "you can
   close this tab" HTML, and resolves with `code`.
6. Exchange the code at `https://api.linear.app/oauth/token`:
   ```
   grant_type=authorization_code
   code=<code>
   redirect_uri=http://127.0.0.1:53682/callback
   client_id=<id>
   code_verifier=<verifier>
   ```
7. Persist the resulting `{access_token, refresh_token?,
   expires_in?, scope}` plus the obtained-at timestamp.
8. Confirm by calling `viewer` and printing the user's name and email.

### Non-TTY / agent (OOB flow)

```
$ lean auth login --json
{
  "auth_url": "https://linear.app/oauth/authorize?client_id=...&response_type=code&redirect_uri=urn%3Aietf%3Awg%3Aoauth%3A2.0%3Aoob&scope=read,write&state=<state>&code_challenge=<challenge>&code_challenge_method=S256",
  "state": "<state>",
  "code_verifier": "<verifier>",
  "expires_in": 600,
  "next": "Open auth_url, authorize, copy the displayed code, then run: lean auth login --complete --code <code> --state <state> --code-verifier <verifier>"
}
```

The agent presents `auth_url` and the `next` instructions to the user.
After the human authorizes in their browser, they hand `code` back
through the agent. The agent calls:

```
$ lean auth login --complete --code <code> --state <state> --code-verifier <verifier> --json
{ "ok": true, "user": { "name": "Peng Lyu", "email": "..." } }
```

The CLI exchanges the code for a token, validates `state`, persists
the result, and exits 0. The split into two invocations makes the
flow stateless — the agent can hand it off to any client without
needing a long-lived session.

The OOB flow uses Linear's "out-of-band" pseudo-redirect-URI
`urn:ietf:wg:oauth:2.0:oob`, which causes Linear's auth page to display
the code on a confirmation page rather than redirecting. The CLI
itself does not need to listen on any port in this mode — it's a pure
two-step exchange.

> Implementation note: if Linear does not support the `urn:...:oob`
> pseudo-URI (verify before shipping), the OOB flow can fall back to
> the `127.0.0.1:53682/callback` redirect with the user instructed to
> copy the `code` query parameter out of their browser's address bar
> after the redirect fails to reach a listening server. We will pick
> the variant that actually works during implementation.

### Headless CI

OAuth is for humans. CI uses `LINEAR_API_KEY` (a Personal API Key
generated at <https://linear.app/settings/api>), exactly as today. The
docs make this distinction explicit so users don't try to OAuth their
way through a build server.

### `auth status` reports the credential source

```
$ lean auth status
Logged in as Peng Lyu (penn.lv@gmail.com)
Auth: OAuth (scope: read,write, expires in 9y 11m)
```

```
$ lean auth status --json
{
  "user": { "id": "...", "name": "Peng Lyu", "email": "..." },
  "auth": { "type": "oauth", "scope": "read,write", "expires_at": "..." }
}
```

API-key auth shows `Auth: API key` and `auth.type: "api_key"`.

### `auth logout` clears everything

Removes both the OAuth and API-key fields from local storage and best-
effort calls Linear's `POST /oauth/revoke` for the access token (and
refresh token, if present). Logout never fails the command on revoke
errors — local credentials are always cleared.

## Credential storage

Three-tier resolution. Whichever tier yields a credential first wins.

| Tier | Source | When used |
|---|---|---|
| 1 | env var: `LINEAR_ACCESS_TOKEN` (Bearer) > `LINEAR_API_KEY` | always wins; CI/agents/scripts |
| 2 | OS keychain (via `@napi-rs/keyring`) | default for `lean auth login` on a desktop |
| 3 | file: `~/.config/lean/config.json` (`chmod 0600`) | fallback when no keychain or `--store file` was passed at login |

The credentials helper module exposes `getCredentials()` which returns
`{ kind: "oauth" | "api_key", token: string }`. If the OAuth access
token has expired and a refresh token is present, it transparently
refreshes via `grant_type=refresh_token` before returning. On refresh
failure, throws `auth_invalid` with action "Run `lean auth login` to
re-authenticate."

### Storage knobs

```
lean config set credential-store keychain   # default, when keychain available
lean config set credential-store file       # always use config.json
```

The doc-test harness sets `credential-store=file` so tests are
keychain-independent.

### Schema additions

`~/.config/lean/config.json` gains an optional `oauth` field alongside
the existing `apiKey`:

```jsonc
{
  "apiKey": "lin_api_...",                  // unchanged, still supported
  "credential_store": "keychain" | "file",  // optional, default keychain
  "oauth": {
    "access_token": "...",
    "refresh_token": "...",
    "expires_at": "2027-05-13T12:34:56Z",   // ISO timestamp, may be absent for very long-lived tokens
    "scope": "read write",
    "obtained_at": "2026-05-13T..."
  }
}
```

When `credential_store` is `keychain`, the `oauth.access_token` and
`oauth.refresh_token` fields live in the keychain instead of the
file; the rest of the metadata stays in `config.json` (or wherever the
keychain stores its non-secret companion data).

## Technical Approach

### New files

- `src/auth/oauth-config.ts` — `client_id` constant,
  `LEAN_OAUTH_CLIENT_ID` env override, scope defaults, base URLs, the
  registered redirect port.
- `src/auth/pkce.ts` — `generateVerifier()`, `challengeFor(verifier)`.
- `src/auth/oauth-flow.ts` — `loginInteractive()` (loopback flow) and
  `loginOob()` (start) + `completeOob({code, state, verifier})`.
- `src/auth/credentials.ts` — `getCredentials()`, `saveCredentials()`,
  `clearCredentials()`. Internally chooses keychain vs file. Handles
  refresh transparently.

### Updates

- `src/api/client.ts` — `getClient()` becomes async, awaits
  `getCredentials()`, picks `accessToken` or `apiKey` for the SDK.
- `src/commands/auth.ts` — `login` gains `--api-key`, `--oauth` (the
  default in TTY), `--code`, `--state`, `--code-verifier`,
  `--complete`, `--scope`. `status` learns the auth-type line. `logout`
  clears keychain + file + best-effort revoke.
- `src/config/index.ts` — schema bump per above.

### Loopback server hardening

- Bind to `127.0.0.1` only (not `0.0.0.0`).
- Hard timeout of 120s.
- Reject any GET on a path other than `/callback`.
- Validate `state` strictly; on mismatch return HTTP 400 and surface a
  `linear_api` error with reason "OAuth state mismatch (possible CSRF)".
- Always close the server after responding (success or error) and
  never start a second listener on the same port from the same
  process.

### Browser open

`open` (macOS) / `start` (Windows) / `xdg-open` (Linux). On
spawn-fails-immediately, print the URL and let the local server keep
listening — the user can paste it into a browser of their choice.

### Doc-tests

The interactive parts of OAuth are not doc-testable through our
existing runner (no real browser, no real Linear OAuth server).
Coverage strategy:

1. `Docs/auth-oauth.md`: a small set of doc-tests covering only the
   structured outputs:
   - `lean auth login --json` (the OOB start) prints the expected
     JSON envelope. We mock the random bits via env vars
     (`LEAN_OAUTH_TEST_VERIFIER`, `LEAN_OAUTH_TEST_STATE`) so the
     output is byte-stable.
   - `lean auth status` reporting `Auth: OAuth` after a token has
     been seeded into config (via a test-mode env or fixture file).
   - `lean auth logout` clearing both credential types.
   - Error cases: `prompt_required_in_non_tty` from `lean auth login`
     when stdin is non-TTY *and* `--complete` / `--api-key` are not
     supplied.
2. **Manual verification checklist** inside `Docs/auth-oauth.md`
   covering the live flow (browser open, redirect capture, status
   after).
3. Unit tests for `src/auth/pkce.ts` and the `--variable`-style
   parsers — these are pure functions and easy to assert.

### Emulator

The local Linear emulator does not currently implement OAuth
endpoints. For doc-test-time auth assertions we'll continue using
`LINEAR_API_KEY` against the emulator (the emulator already accepts
that). Adding OAuth endpoints to the emulator (`/oauth/authorize`,
`/oauth/token`, `/oauth/revoke`) is **out of scope** for this spec;
file an emulator-side issue if we ever want OAuth-flow doc-tests
running end-to-end.

## Edge cases

- **Port 53682 already in use** → `port_busy` error suggesting either
  `--port <other>` (with the URI registered against the OAuth app) or
  `--oob` to use the out-of-band flow.
- **State mismatch in callback** → HTTP 400 from the local server,
  CLI exits with `linear_api` and a CSRF-flavored message.
- **User authorizes, but the redirect can't reach localhost** (corp
  proxy, VPN) → 120s timeout, error suggesting `--oob`.
- **Refresh token rejected** → `auth_invalid`, action "Run
  `lean auth login` to re-authenticate."
- **Both API key and OAuth present** in storage →
  `getCredentials()` prefers OAuth; `lean auth logout` clears both;
  `lean auth status` reports the active one.
- **Keychain locked / unavailable** → fall through to file store with
  a one-line warning; never block the user.
- **Tokens leak in logs** → never print `access_token` or
  `refresh_token`; "Logged in as ..." shows name + email only. The
  reporter never prints `cause` on `LeanError`.

## Acceptance criteria

- [ ] `lean auth login` (TTY, no flags) opens a browser, captures the
      callback at `127.0.0.1:53682/callback`, exchanges the code, and
      reports `Logged in as ...`.
- [ ] `lean auth login --api-key <key>` continues to work headlessly
      (no browser, no prompts).
- [ ] `lean auth login --json` (non-TTY) prints the OOB envelope.
- [ ] `lean auth login --complete --code ... --state ...
      --code-verifier ...` exchanges the code and persists the token.
- [ ] `lean auth status` reports `Auth: OAuth` with the active scope
      and approximate expiry (or `Auth: API key`).
- [ ] `lean auth logout` clears both keychain and file storage and
      best-effort revokes.
- [ ] Token refresh fires transparently when `expires_at` has passed.
- [ ] Credential precedence:
      `LINEAR_ACCESS_TOKEN > LINEAR_API_KEY > config.oauth >
      config.apiKey`.
- [ ] All existing 48 doc-tests still pass.
- [ ] New `Docs/auth-oauth.md` covers what's doc-testable plus a
      manual checklist for the live flow.
- [ ] `Decisions.md` ADR records: PKCE-with-public-client_id, fixed
      loopback port 53682, OOB as the agent path, keychain-default
      with file fallback.

## Open questions for the reviewer

1. **`urn:ietf:wg:oauth:2.0:oob` support.** Verify Linear actually
   honours the OOB pseudo-redirect URI. If not, the OOB flow becomes
   "use `127.0.0.1:53682` as the redirect; user reads the `code` out
   of the address bar after the listener fails." Pick the working
   variant during implementation.
2. **`actor=user` query param.** Linear's OAuth supports an
   `actor=user|app` parameter that affects which entity is recorded as
   the actor of API actions. We default to `user`. Confirm this is the
   right default.
3. **Scope granularity.** Default `read,write` is broad. If we want
   to be more conservative we could request `read,issues:create,
   comments:create` initially and bump on demand. Worth
   discussing in review.
4. **Keychain dependency.** `@napi-rs/keyring` adds a native
   dependency that some users (alpine containers, NixOS) may struggle
   with. We could ship file-only by default and gate keychain behind
   `lean config set credential-store keychain`. Reviewer's call.
