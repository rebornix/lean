# lean issue list

`lean issue list` lists Linear issues. Default is to list issues assigned
to **you** (the viewer); pass `--all` (or `--assignee anyone`) to remove
that filter. Combine with `--team`, `--state`, `--priority`, `--limit`,
`--json`.

## Default (your assigned issues)

```console
$ lean issue list
ID     Title         State  Priority  Assignee
─────  ────────────  ─────  ────────  ────────
ENG-1  First issue   Todo   None      Alice   
ENG-4  Refactor API  Done   High      Alice
```

## Show all issues with --all

```console
$ lean issue list --all
ID     Title          State        Priority  Assignee
─────  ─────────────  ───────────  ────────  ────────
ENG-1  First issue    Todo         None      Alice   
ENG-2  Login bug      In Progress  Urgent    Bob     
ENG-3  Add dark mode  Todo         Medium    Bob     
ENG-4  Refactor API   Done         High      Alice
```

## --assignee anyone is equivalent to --all

```console
$ lean issue list --assignee anyone
ID     Title          State        Priority  Assignee
─────  ─────────────  ───────────  ────────  ────────
ENG-1  First issue    Todo         None      Alice   
ENG-2  Login bug      In Progress  Urgent    Bob     
ENG-3  Add dark mode  Todo         Medium    Bob     
ENG-4  Refactor API   Done         High      Alice
```

## Filter by team

```console
$ lean issue list --team ENG
ID     Title         State  Priority  Assignee
─────  ────────────  ─────  ────────  ────────
ENG-1  First issue   Todo   None      Alice   
ENG-4  Refactor API  Done   High      Alice
```

## Filter by state

```console
$ lean issue list --state Todo
ID     Title        State  Priority  Assignee
─────  ───────────  ─────  ────────  ────────
ENG-1  First issue  Todo   None      Alice
```

## Filter by assignee email

```console
$ lean issue list --assignee bob@acme.com
ID     Title          State        Priority  Assignee
─────  ─────────────  ───────────  ────────  ────────
ENG-2  Login bug      In Progress  Urgent    Bob     
ENG-3  Add dark mode  Todo         Medium    Bob
```

## Empty result

```console
$ lean issue list --priority 1
No issues match.
```

## JSON output

```console
$ lean issue list --json
[
  {
    "id": "ENG-1",
    "title": "First issue",
    "state": "Todo",
    "priority": 0,
    "priorityLabel": "None",
    "assignee": "alice@acme.com"
  },
  {
    "id": "ENG-4",
    "title": "Refactor API",
    "state": "Done",
    "priority": 2,
    "priorityLabel": "High",
    "assignee": "alice@acme.com"
  }
]
```
