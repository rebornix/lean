# lean auth status

`lean auth status` shows the currently authenticated Linear user, using the
API key stored in config or `LINEAR_API_KEY`.

## Logged in

```console
$ lean auth status
Logged in as: Alice (alice@acme.com)
```

## JSON output

```console
$ lean auth status --json
{
  "authenticated": true,
  "user": {
    "id": "user-alice",
    "name": "Alice",
    "email": "alice@acme.com"
  }
}
```
