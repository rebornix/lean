# lean auth logout

`lean auth logout` removes the stored API key from
`~/.config/lean/config.json`. With no stored key and `LINEAR_API_KEY` still
set in the env, subsequent `auth status` commands continue to work, since
the env var takes precedence.

## Logout is idempotent

```console
$ lean auth logout
Logged out.
```

## auth status still works when LINEAR_API_KEY is set

```console
$ lean auth status
Logged in as: Alice (alice@acme.com)
Auth: API key
```
