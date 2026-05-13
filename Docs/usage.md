# lean usage

`lean usage` and `lean <cmd> usage` are hand-curated, token-budgeted
discovery surfaces (~150 tokens each). They are intentionally separate
from `lean --help`, which prints commander's full auto-generated tree.

## Top-level usage

```console
$ lean usage
lean - CLI for Linear project management

Commands:
  auth     Authentication (login, status, logout)
  issue    Issues (list, view, create, edit, close, comment)
  api      Send a raw GraphQL request to Linear
  usage    Show this help, or `lean <cmd> usage` for command details

All commands support --json for structured output. Errors are emitted as
JSON on stderr in non-TTY / --json mode. Exit codes: 0 success, 1 user
error, 2 auth, 3 network, 4 internal.

Use `lean <command> usage` for details, or `lean --help` for full help.
```

## Auth usage

```console
$ lean auth usage
lean auth - Authentication

  login   Save a Linear API key (--api-key for headless)
  status  Show the currently authenticated user (--json)
  logout  Remove stored credentials

Env: LINEAR_API_KEY overrides ~/.config/lean/config.json.
```

## Issue usage

```console
$ lean issue usage
lean issue - Issue management

  list    List issues (--team, --state, --assignee, --priority, --limit, --json)
  view    Show one issue (--json, --web)
  create  Create an issue (--team, --title, --description, --description-file,
          --priority, --state, --assignee, --json)
  edit    Update an issue (--title, --state, --assignee, --priority, --json)
  close   Move an issue to its team's first completed state (--json)
  comment Add a comment (--body, --body-file, --json)

Identifiers: ENG-1 (team key + number) or a UUID.

All commands support --json. See Docs/issue-*.md for examples.
```

## API usage

```console
$ lean api usage
lean api - Send a raw GraphQL request to Linear

Flags:
  --query <gql>         Inline GraphQL document (one of --query / --query-file)
  --query-file <path>   Read query from file
  --variable <key=val>  Variable; repeatable. Value is JSON if it starts with
                        { [ " digit / -, or true/false/null. Otherwise string.
  --operation <name>    Pick an operation when the document defines several.
  --paginate            Walk pageInfo.endCursor; merge nodes (cap 50 pages).

Output is always JSON: { "data": ... }. Linear errors raise exit 1 with
the GraphQL errors in the payload. Network = exit 3. Auth = exit 2.
```

## Unknown topic

```console
$ lean usage bogus
{
  "error": "not_found",
  "message": "Unknown usage topic: bogus",
  "exit_code": 1,
  "action": "Try `lean usage` for the list of topics"
}
```
