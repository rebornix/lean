# lean issue children/tree

`lean issue children` lists one level of child issues. `lean issue tree`
returns the parent issue plus that same one-level child list. The local
emulator seed has no child issues, so these examples lock in empty-state
behaviour.

## List children

```console
$ lean issue children ENG-1
No child issues match.
```

## Children as JSON

```console
$ lean issue children ENG-1 --json
[]
```

## Tree as JSON

```console
$ lean issue tree ENG-1 --json
{
  "id": "ENG-1",
  "title": "First issue",
  "state": "Todo",
  "priority": 0,
  "priorityLabel": "None",
  "assignee": "alice@acme.com",
  "dueDate": null,
  "url": "http://localhost:4100/ENG/issue/ENG-1/first-issue",
  "children": []
}
```

## Invalid limit errors

```console
$ lean issue children ENG-1 --limit nope --json
{
  "error": "invalid_argument",
  "message": "Invalid --limit: nope",
  "exit_code": 1,
  "action": "Use a non-negative integer."
}
```
