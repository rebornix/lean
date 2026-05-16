---
env:
  LEAN_OAUTH_CLIENT_ID: doc_test_client_id
  LEAN_OAUTH_TEST_VERIFIER: doc_test_verifier_value_for_pkce
  LEAN_OAUTH_TEST_STATE: doc_test_state_value
---

# lean auth login (OAuth)

`lean auth login` uses OAuth when no `--api-key` is provided. The
interactive flow (open a browser, capture the redirect) can't be covered
by doc-tests — see the manual checklist at the bottom of this file for
the live flow.

These tests cover the non-interactive paths: the out-of-band (OOB)
envelope an agent receives, completing an OOB flow, and the configured
error when no OAuth app has been registered.

## OOB start: piped stdin gets a structured envelope

```console
$ lean auth login
{
  "auth_url": "https://linear.app/oauth/authorize?client_id=doc_test_client_id&response_type=code&redirect_uri=http%3A%2F%2F127.0.0.1%3A53682%2Fcallback&scope=read%2Cwrite&state=doc_test_state_value&code_challenge=IYYwHNCWmr4NwpUX3IaEpA5KOeDlzsjws589bZj30EU&code_challenge_method=S256&actor=user",
  "state": "doc_test_state_value",
  "code_verifier": "doc_test_verifier_value_for_pkce",
  "next": "Open auth_url, authorize Linear, copy the displayed code, then run: lean auth login --complete --code <code> --state <state> --code-verifier <verifier>"
}
```

## A narrower scope is honoured

```console
$ lean auth login --scope read
{
  "auth_url": "https://linear.app/oauth/authorize?client_id=doc_test_client_id&response_type=code&redirect_uri=http%3A%2F%2F127.0.0.1%3A53682%2Fcallback&scope=read&state=doc_test_state_value&code_challenge=IYYwHNCWmr4NwpUX3IaEpA5KOeDlzsjws589bZj30EU&code_challenge_method=S256&actor=user",
  "state": "doc_test_state_value",
  "code_verifier": "doc_test_verifier_value_for_pkce",
  "next": "Open auth_url, authorize Linear, copy the displayed code, then run: lean auth login --complete --code <code> --state <state> --code-verifier <verifier>"
}
```

## --complete requires --code and --code-verifier

```console
$ lean auth login --complete
{
  "error": "missing_required_flag",
  "message": "--complete requires --code and --code-verifier (and --state if you started with one)",
  "exit_code": 1
}
```

## --api-key still works headlessly

```console
$ lean auth login --api-key lin_api_test
API key saved.
```

## A missing OAuth client_id raises a configured error

```console
$ env -u LEAN_OAUTH_CLIENT_ID lean auth login
{
  "error": "invalid_argument",
  "message": "OAuth client ID is not configured. The OAuth app for @rebornix/lean has not been registered with Linear yet.",
  "exit_code": 1,
  "action": "Register an OAuth app at https://linear.app/settings/api/applications and set LEAN_OAUTH_CLIENT_ID; see Specs/007-oauth.md for details."
}
```

## Manual verification (live OAuth flow)

Doc-tests can't drive a real browser. To smoke-test the loopback flow
against api.linear.app:

1. Register an OAuth app at <https://linear.app/settings/api/applications>.
   Set the redirect URI to `http://127.0.0.1:53682/callback`.
2. Export the client ID: `export LEAN_OAUTH_CLIENT_ID=<id>`.
3. Run `lean auth login` from a terminal. A browser tab should open at
   Linear's authorization page.
4. Click "Authorize". The browser should display
   "Logged in. You can close this tab and return to your terminal."
5. The terminal should report `Logged in as <name> (<email>).`
6. `lean auth status` should report `Auth: OAuth (scope: read,write)`.
7. `lean issue list --limit 3` should work without further prompts.
8. `lean auth logout` should clear credentials and report `Logged out.`
