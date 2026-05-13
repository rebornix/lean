# lean issue close

`lean issue close <ID>` moves the issue to its team's first workflow state
of type `completed`.

## Close an issue

```console
$ lean issue close ENG-1
Closed ENG-1
```

## JSON output

```console
$ lean issue close ENG-1 --json
{
  "id": "ENG-1",
  "closed": true
}
```

## Unknown issue

```console
$ lean issue close ENG-999
{
  "error": "not_found",
  "message": "Issue not found: ENG-999",
  "exit_code": 1
}
```
