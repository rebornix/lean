# lean issue comment

`lean issue comment` manages comments on issues. The existing shorthand
still adds a comment:

```console
$ lean issue comment ENG-1 --body "Fixed in PR #42"
Commented on ENG-1
```

## Add

```console
$ lean issue comment add ENG-1 --body-file Docs/fixtures/comment.md --json
{
  "id": "<uuid>",
  "issue": "ENG-1",
  "body": "Comment from file.\n",
  "user": "alice@acme.com",
  "createdAt": "<timestamp>",
  "updatedAt": "<timestamp>"
}
```

## List

```console
$ lean issue comment ENG-1 --body "Progress update"
Commented on ENG-1
$ lean issue comment list ENG-1 --json
[
  {
    "id": "<uuid>",
    "issue": "ENG-1",
    "body": "Progress update",
    "user": "alice@acme.com",
    "createdAt": "<timestamp>",
    "updatedAt": "<timestamp>"
  }
]
```

## View, edit, and delete

Use a comment ID returned by `add`, `list`, or `view`.

```console
$ lean issue comment add ENG-1 --body "Lifecycle check" --json
{
  "id": "<uuid>",
  "issue": "ENG-1",
  "body": "Lifecycle check",
  "user": "alice@acme.com",
  "createdAt": "<timestamp>",
  "updatedAt": "<timestamp>"
}
$ lean issue comment view <last-id> --json
{
  "id": "<uuid>",
  "issue": "ENG-1",
  "body": "Lifecycle check",
  "user": "alice@acme.com",
  "createdAt": "<timestamp>",
  "updatedAt": "<timestamp>"
}
$ lean issue comment edit <last-id> --body "Lifecycle edited" --json
{
  "id": "<uuid>",
  "issue": "ENG-1",
  "body": "Lifecycle edited",
  "user": "alice@acme.com",
  "createdAt": "<timestamp>",
  "updatedAt": "<timestamp>"
}
$ lean issue comment delete <last-id> --confirm --json
{
  "id": "<uuid>",
  "deleted": true
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

## Empty body errors

```console
$ lean issue comment add ENG-1 --body "   "
{
  "error": "invalid_argument",
  "message": "Comment body cannot be empty",
  "exit_code": 1
}
```

## Delete confirmation errors

```console
$ lean issue comment delete missing-comment
{
  "error": "invalid_argument",
  "message": "Deleting a comment requires --confirm",
  "exit_code": 1,
  "action": "Pass --confirm to delete the comment."
}
```

## Missing comment errors

```console
$ lean issue comment view missing-comment
{
  "error": "not_found",
  "message": "Comment not found: missing-comment",
  "exit_code": 1
}
```
