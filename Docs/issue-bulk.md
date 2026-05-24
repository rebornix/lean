# lean issue bulk-create / bulk-edit

Bulk commands read JSON files, apply defaults, and report partial
success with stable `created` / `updated` and `failed` arrays.

## Bulk create

```console
$ lean issue bulk-create --file Docs/fixtures/bulk-create.json --json
{
  "created": [
    {
      "id": "ENG-5",
      "title": "Bulk alpha",
      "state": "Todo",
      "priority": 2,
      "priorityLabel": "High",
      "assignee": "alice@acme.com",
      "url": "http://localhost:4100/ENG/issue/ENG-5/bulk-alpha"
    },
    {
      "id": "ENG-6",
      "title": "Bulk beta",
      "state": "Todo",
      "priority": 4,
      "priorityLabel": "Low",
      "assignee": "bob@acme.com",
      "url": "http://localhost:4100/ENG/issue/ENG-6/bulk-beta"
    }
  ],
  "failed": []
}
```

## Bulk edit

```console
$ lean issue bulk-edit --file Docs/fixtures/bulk-edit.json --json
{
  "updated": [
    {
      "id": "ENG-1",
      "title": "First issue",
      "state": "Todo",
      "priority": 1,
      "priorityLabel": "Urgent",
      "assignee": "alice@acme.com",
      "url": "http://localhost:4100/ENG/issue/ENG-1/first-issue"
    },
    {
      "id": "ENG-2",
      "title": "Login bug",
      "state": "Done",
      "priority": 1,
      "priorityLabel": "Urgent",
      "assignee": "alice@acme.com",
      "url": "http://localhost:4100/ENG/issue/ENG-2/login-bug"
    }
  ],
  "failed": []
}
```

## Empty bulk file errors

```console
$ lean issue bulk-create --file Docs/fixtures/bulk-create-invalid.json --json
{
  "error": "invalid_argument",
  "message": "Bulk file must contain a non-empty issues array",
  "exit_code": 1
}
```
