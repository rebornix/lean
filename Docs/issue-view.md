# lean issue view

`lean issue view <ID>` shows a single issue.

## View by identifier

```console
$ lean issue view ENG-1
ENG-1: First issue
State:    Todo
Priority: None
Assignee: Alice
URL:      http://localhost:4100/ENG/issue/ENG-1/first-issue

(no description)
```

## JSON output

```console
$ lean issue view ENG-1 --json
{
  "id": "ENG-1",
  "title": "First issue",
  "description": null,
  "state": "Todo",
  "priority": 0,
  "priorityLabel": "None",
  "assignee": "alice@acme.com",
  "url": "http://localhost:4100/ENG/issue/ENG-1/first-issue"
}
```

## Unknown identifier

```console
$ lean issue view ENG-999
{
  "error": "not_found",
  "message": "Issue not found: ENG-999",
  "exit_code": 1
}
```
