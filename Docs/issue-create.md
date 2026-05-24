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

## Create with project

```console
$ lean issue create --team ENG --project launch --title "Plan launch checklist" --json
{
  "id": "ENG-5",
  "title": "Plan launch checklist",
  "state": null,
  "priority": 0,
  "priorityLabel": "None",
  "assignee": null,
  "project": {
    "id": "project-launch",
    "name": "Launch",
    "slugId": "launch",
    "state": "started",
    "team": "ENG"
  },
  "url": "http://localhost:4100/ENG/issue/ENG-5/plan-launch-checklist"
}
```

## Create with unique partial project

```console
$ lean issue create --team ENG --project Res --title "Research spike" --json
{
  "id": "ENG-5",
  "title": "Research spike",
  "state": null,
  "priority": 0,
  "priorityLabel": "None",
  "assignee": null,
  "project": {
    "id": "project-research",
    "name": "Research",
    "slugId": "research",
    "state": "planned",
    "team": "ENG"
  },
  "url": "http://localhost:4100/ENG/issue/ENG-5/research-spike"
}
```

## Create with priority label

```console
$ lean issue create --team ENG --title "Prioritized work" --priority High --json
{
  "id": "ENG-5",
  "title": "Prioritized work",
  "state": null,
  "priority": 2,
  "priorityLabel": "High",
  "assignee": null,
  "url": "http://localhost:4100/ENG/issue/ENG-5/prioritized-work"
}
```

## Create with --json

```console
$ lean issue create --team ENG --title "JSON output check" --json
{
  "id": "ENG-5",
  "title": "JSON output check",
  "state": null,
  "priority": 0,
  "priorityLabel": "None",
  "assignee": null,
  "url": "http://localhost:4100/ENG/issue/ENG-5/json-output-check"
}
```

## Invalid due date errors

```console
$ lean issue create --team ENG --title "Bad date" --due-date tomorrow --json
{
  "error": "invalid_argument",
  "message": "Invalid --due-date: tomorrow",
  "exit_code": 1,
  "action": "Use YYYY-MM-DD."
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

## Unknown project errors

```console
$ lean issue create --team ENG --project Missing --title "x"
{
  "error": "not_found",
  "message": "Project not found for team ENG: Missing",
  "exit_code": 1,
  "action": "Use a project id, exact name, slugId, or a unique partial name."
}
```

## Ambiguous project errors

```console
$ lean issue create --team ENG --project Re --title "x"
{
  "error": "invalid_argument",
  "message": "Project reference is ambiguous for team ENG: Re",
  "exit_code": 1,
  "action": "Use a project id or slugId instead of a partial name.",
  "details": {
    "matches": [
      {
        "id": "project-research",
        "name": "Research",
        "slugId": "research",
        "state": "planned"
      },
      {
        "id": "project-refactor",
        "name": "Refactor",
        "slugId": "refactor",
        "state": "completed"
      }
    ]
  }
}
```
