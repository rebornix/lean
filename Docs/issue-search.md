# lean issue search

`lean issue search <query>` finds likely matching issues without piping
`lean issue list --json` through another tool. It uses the same team,
state, assignee, priority, limit, and output flags as `issue list`.

## Search all assignees

```console
$ lean issue search Login --team ENG --assignee anyone --json
[
  {
    "id": "ENG-2",
    "title": "Login bug",
    "state": "In Progress",
    "priority": 1,
    "priorityLabel": "Urgent",
    "assignee": "bob@acme.com",
    "url": "http://localhost:4100/ENG/issue/ENG-2/login-bug"
  }
]
```

## Search default assignee

```console
$ lean issue search issue
ID     Title        State  Priority  Assignee
─────  ───────────  ─────  ────────  ────────
ENG-1  First issue  Todo   None      Alice
```

## Empty search

```console
$ lean issue search Missing --assignee anyone
No issues match.
```

## Invalid limit errors

```console
$ lean issue search Login --limit nope --json
{
  "error": "invalid_argument",
  "message": "Invalid --limit: nope",
  "exit_code": 1,
  "action": "Use a non-negative integer."
}
```
