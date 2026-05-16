# lean auth login

`lean auth login` stores a Linear API key in `~/.config/lean/config.json`.
The interactive prompt path is exercised by humans; doc-tests cover the
non-interactive case where `LINEAR_API_KEY` is already set in the
environment, so `auth status` succeeds without any prompt.

## Status reflects the env var when no key has been stored

```console
$ lean auth status
Logged in as: Alice (alice@acme.com)
Auth: API key
```
