# lean issue create

`lean issue create` creates a new issue. In non-TTY (doc-test, CI) mode,
all required fields must be supplied via flags. In a TTY, missing fields
fall back to interactive prompts.

## Create with team and title

```console
$ lean issue create --team ENG --title "Fix the bug"
ENG-5: Fix the bug
```

## Create with state and assignee

```console
$ lean issue create --team ENG --title "Add docs" --state "In Progress" --assignee alice@acme.com
ENG-5: Add docs
```

## Create with --json

```console
$ lean issue create --team ENG --title "JSON output check" --json
{
  "id": "ENG-5",
  "title": "JSON output check"
}
```

## Missing --team or --title errors

```console
$ lean issue create --json
{
  "error": "missing_required_flag",
  "message": "--team and --title are required",
  "exit_code": 1,
  "action": "Pass --team <key> and --title <text>"
}
```

## Unknown team errors

```console
$ lean issue create --team NOPE --title "x"
{
  "error": "not_found",
  "message": "Team not found: NOPE",
  "exit_code": 1
}
```
