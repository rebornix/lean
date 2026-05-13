# lean issue comment

`lean issue comment <ID>` adds a comment to an issue. Provide the body
inline with `--body` or read it from a file with `--body-file`.

## Inline body

```console
$ lean issue comment ENG-1 --body "Fixed in PR #42"
Commented on ENG-1
```

## JSON output

```console
$ lean issue comment ENG-1 --body "JSON shaped" --json
{
  "issue": "ENG-1",
  "body": "JSON shaped"
}
```

## Missing body errors

```console
$ lean issue comment ENG-1
{
  "error": "missing_required_flag",
  "message": "--body or --body-file is required",
  "exit_code": 1,
  "action": "Provide --body <text> or --body-file <path>"
}
```
