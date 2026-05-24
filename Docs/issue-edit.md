# lean issue edit

`lean issue edit <ID>` updates fields on an existing issue. Each flag
corresponds to a field; absent flags are left unchanged.

## Rename an issue

```console
$ lean issue edit ENG-1 --title "Renamed"
ENG-1: Renamed
```

## Move to a different state

```console
$ lean issue edit ENG-1 --state Done
ENG-1: First issue
```

## Change priority

```console
$ lean issue edit ENG-1 --priority Urgent
ENG-1: First issue
```

## Replace description

```console
$ lean issue edit ENG-1 --description "New body" --json
{
  "id": "ENG-1",
  "title": "First issue",
  "description": "New body",
  "state": "Todo",
  "priority": 0,
  "priorityLabel": "None",
  "assignee": "alice@acme.com",
  "url": "http://localhost:4100/ENG/issue/ENG-1/first-issue"
}
```

## JSON output

```console
$ lean issue edit ENG-1 --title "New name" --json
{
  "id": "ENG-1",
  "title": "New name",
  "state": "Todo",
  "priority": 0,
  "priorityLabel": "None",
  "assignee": "alice@acme.com",
  "url": "http://localhost:4100/ENG/issue/ENG-1/first-issue"
}
```

## Invalid due date errors

```console
$ lean issue edit ENG-1 --due-date tomorrow --json
{
  "error": "invalid_argument",
  "message": "Invalid --due-date: tomorrow",
  "exit_code": 1,
  "action": "Use YYYY-MM-DD."
}
```

## Missing field errors

```console
$ lean issue edit ENG-1 --json
{
  "error": "missing_required_flag",
  "message": "No fields to update",
  "exit_code": 1,
  "action": "Pass at least one editable field."
}
```
