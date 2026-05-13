# Errors

`lean` distinguishes errors by a stable machine-readable shape and exit
codes. In agent mode (non-TTY stdout, or `--json`), errors are emitted as
JSON on stderr.

## Schema

```
{
  "error":      <stable snake_case id>,
  "message":    <human-readable, one line>,
  "action"?:    <what to do next>,
  "exit_code":  <0 | 1 | 2 | 3 | 4>,
  "details"?:   <object>
}
```

Exit codes: `0` success, `1` user error, `2` auth error, `3` network error,
`4` internal error.

## Missing required flag

```console
$ lean issue create
{
  "error": "missing_required_flag",
  "message": "--team and --title are required",
  "exit_code": 1,
  "action": "Pass --team <key> and --title <text>"
}
```

## Not found

```console
$ lean issue view ENG-999
{
  "error": "not_found",
  "message": "Issue not found: ENG-999",
  "exit_code": 1
}
```

## Comment without --body

```console
$ lean issue comment ENG-1
{
  "error": "missing_required_flag",
  "message": "--body or --body-file is required",
  "exit_code": 1,
  "action": "Provide --body <text> or --body-file <path>"
}
```

## Auth required

```console
$ env -u LINEAR_API_KEY lean auth status
{
  "error": "auth_required",
  "message": "No API key configured",
  "exit_code": 2,
  "action": "Run `lean auth login` or set LINEAR_API_KEY"
}
```

## Login refuses to prompt in non-TTY mode

```console
$ env -u LINEAR_API_KEY lean auth login
{
  "error": "prompt_required_in_non_tty",
  "message": "Cannot prompt for API key in non-interactive mode",
  "exit_code": 1,
  "action": "Pass --api-key <key> or set LINEAR_API_KEY"
}
```

## Login with --api-key works headlessly

```console
$ lean auth login --api-key lin_api_test
API key saved.
```
