# lean project list

`lean project list` shows Linear projects so agents and humans can choose
the right project before creating issues.

## List team projects

```console
$ lean project list --team ENG
ID                Name      State      Team
────────────────  ────────  ─────────  ────
project-launch    Launch    started    ENG
project-research  Research  planned    ENG
project-refactor  Refactor  completed  ENG
```

## List projects across teams

```console
$ lean project list --limit 2
ID                Name      State    Team
────────────────  ────────  ───────  ────
project-launch    Launch    started  ENG
project-research  Research  planned  ENG
```

## List projects as JSON

```console
$ lean project list --team ENG --json
[
  {
    "id": "project-launch",
    "name": "Launch",
    "slugId": "launch",
    "state": "started",
    "team": "ENG"
  },
  {
    "id": "project-research",
    "name": "Research",
    "slugId": "research",
    "state": "planned",
    "team": "ENG"
  },
  {
    "id": "project-refactor",
    "name": "Refactor",
    "slugId": "refactor",
    "state": "completed",
    "team": "ENG"
  }
]
```

## Filter by state

```console
$ lean project list --team ENG --state planned
ID                Name      State    Team
────────────────  ────────  ───────  ────
project-research  Research  planned  ENG
```

## Unknown team errors

```console
$ lean project list --team NOPE
{
  "error": "not_found",
  "message": "Team not found: NOPE",
  "exit_code": 1
}
```

## Invalid limit errors

```console
$ lean project list --limit nope
{
  "error": "invalid_argument",
  "message": "Invalid --limit: nope",
  "exit_code": 1,
  "action": "Use a non-negative integer."
}
```
