# lean api

`lean api` sends a raw GraphQL request to Linear. Use it for anything the
CLI does not directly expose. Always emits JSON on stdout.

## Inline query

```console
$ lean api --query "{ viewer { id email } }"
{
  "data": {
    "viewer": {
      "id": "user-alice",
      "email": "alice@acme.com"
    }
  }
}
```

## Variable typed as string

```console
$ lean api --query "query Q($id: String!) { issue(identifier: $id) { id identifier title } }" --variable id=ENG-1
{
  "data": {
    "issue": {
      "id": "issue-1",
      "identifier": "ENG-1",
      "title": "First issue"
    }
  }
}
```

## Variable typed as JSON object

```console
$ lean api --query "mutation M($input: IssueLabelCreateInput!) { issueLabelCreate(input: $input) { issueLabel { id name } } }" --variable 'input={"name":"Tech-debt","teamId":"team-eng"}'
{
  "data": {
    "issueLabelCreate": {
      "issueLabel": {
        "id": "<uuid>",
        "name": "Tech-debt"
      }
    }
  }
}
```

## Pagination

```console
$ lean api --query "query Q($after: String) { issues(first: 2, after: $after) { nodes { identifier } pageInfo { endCursor hasNextPage } } }" --paginate
{
  "data": {
    "issues": {
      "nodes": [
        {
          "identifier": "ENG-1"
        },
        {
          "identifier": "ENG-2"
        },
        {
          "identifier": "ENG-3"
        },
        {
          "identifier": "ENG-4"
        }
      ],
      "pageInfo": {
        "endCursor": "bGluZWFyOjM",
        "hasNextPage": false
      }
    }
  }
}
```

## Missing query is a user error

```console
$ lean api
{
  "error": "missing_required_flag",
  "message": "--query or --query-file is required",
  "exit_code": 1
}
```

## Both --query and --query-file is invalid

```console
$ lean api --query "{viewer{id}}" --query-file foo.graphql
{
  "error": "invalid_argument",
  "message": "Pass --query or --query-file, not both",
  "exit_code": 1
}
```

## Malformed --variable

```console
$ lean api --query "{viewer{id}}" --variable nope
{
  "error": "invalid_argument",
  "message": "--variable must be key=value: nope",
  "exit_code": 1
}
```
