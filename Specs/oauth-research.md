# Research: OAuth in Linear (for `lean`)

What Linear's OAuth surface actually offers, and what that constrains in
our CLI design. All claims here verified against Linear's developer
documentation as of mid-2026.

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
