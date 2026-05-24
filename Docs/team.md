# lean team

`lean team` discovers Linear teams and the workflow states/projects
agents need before creating or moving issues.

## List teams

```console
$ lean team list
ID        Key  Name
────────  ───  ───────────
team-eng  ENG  Engineering
```

## List teams as JSON

```console
$ lean team list --json
[
  {
    "id": "team-eng",
    "key": "ENG",
    "name": "Engineering"
  }
]
```

## View states

```console
$ lean team view ENG --states --json
{
  "id": "team-eng",
  "key": "ENG",
  "name": "Engineering",
  "states": [
    {
      "id": "state-todo",
      "name": "Todo",
      "type": "unstarted",
      "position": 1
    },
    {
      "id": "state-progress",
      "name": "In Progress",
      "type": "started",
      "position": 2
    },
    {
      "id": "state-done",
      "name": "Done",
      "type": "completed",
      "position": 3
    }
  ]
}
```

## View projects

```console
$ lean team view ENG --projects --json
{
  "id": "team-eng",
  "key": "ENG",
  "name": "Engineering",
  "projects": [
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
}
```

## Unknown team errors

```console
$ lean team view NOPE --json
{
  "error": "not_found",
  "message": "Team not found: NOPE",
  "exit_code": 1
}
```
