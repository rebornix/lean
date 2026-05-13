# lean — agent skill file

`lean` is a TypeScript CLI for Linear (linear.app) modelled on `gh`. It is
human-friendly in a TTY and machine-friendly everywhere else (non-TTY
stdout or `--json` automatically produces JSON output for errors and
trips agent-mode behaviour). This document is intended to be loaded by
LLM agents as a single, self-contained reference.

## Authentication

```
LINEAR_API_KEY=lin_api_...   # env var; preferred for CI / agents
~/.config/lean/config.json   # written by `lean auth login --api-key ...`
```

`LINEAR_API_KEY` always wins over the config file. If neither is set, any
command that talks to Linear emits the structured error
`{"error":"auth_required","exit_code":2,...}`.

## Discovery

Two-tier, hand-curated, token-budgeted help:

```
lean usage              # ~150 tokens; lists top-level commands
lean <cmd> usage        # ~150 tokens; lists actions for one command
lean --help             # commander's full auto-generated tree (verbose)
```

The `usage` text is contractual — it is verified by `Docs/usage.md` and
won't drift silently.

## Commands

```
lean auth login [--api-key <key>]
lean auth status [--json]
lean auth logout

lean issue list [--team <key>] [--state <name>] [--assignee @me|<email>]
                [--priority 0..4] [--limit N] [--json]
lean issue view <ENG-1|UUID> [--json] [--web]
lean issue create --team <key> --title <text>
                  [--description <text> | --description-file <path>]
                  [--priority 0..4] [--state <name>] [--assignee @me|<email>]
                  [--json]
lean issue edit <ENG-1|UUID>
                [--title <text>] [--state <name>]
                [--assignee @me|<email>] [--priority 0..4] [--json]
lean issue close <ENG-1|UUID> [--json]
lean issue comment <ENG-1|UUID>
                   [--body <text> | --body-file <path>] [--json]

lean api --query <gql> | --query-file <path>
         [--variable key=value]... [--operation <name>] [--paginate]
```

## Output and errors

- Success: human mode prints a small table or message; agent mode (or
  `--json`) prints a JSON payload on stdout.
- Errors: agent mode prints
  `{"error":<id>,"message":<text>,"action"?:<text>,"exit_code":<n>,"details"?:{...}}`
  on stderr. Human mode prints `Error: ...` and an optional `Hint:` line.
- Exit codes: `0` success, `1` user error, `2` auth, `3` network, `4`
  internal.

Stable error identifiers: `missing_required_flag`, `not_found`,
`invalid_argument`, `prompt_required_in_non_tty`, `auth_required`,
`auth_invalid`, `network`, `linear_api`, `internal`.

## Filters

`lean issue list` supports the most common narrowings:

```
lean issue list --state Todo
lean issue list --assignee @me
lean issue list --priority 1
lean issue list --team ENG --state "In Progress" --json
```

Filtering is real (the local emulator uses `LEAN_EMULATOR_STRICT=1` to
fail loudly on bad shapes). Anything more complex than these flags goes
through `lean api`.

## Identifier resolution

Issues accept either the team-scoped key (`ENG-1`) or a UUID. Most other
commands accept emails (assignees) or workflow-state names (states).
Internal UUIDs are always accepted at the boundary.

## Raw GraphQL escape hatch (`lean api`)

Use this whenever the CLI does not directly expose what you need.

```bash
lean api --query '{ viewer { id name email } }'

lean api --query 'query($id: String!) { issue(identifier: $id) { id title state { name } } }' \
  --variable id=ENG-1

lean api --query 'mutation($input: IssueLabelCreateInput!) {
                    issueLabelCreate(input: $input) { issueLabel { id name } }
                  }' \
  --variable input='{"name":"Tech Debt","teamId":"team-eng"}'

lean api --query '{ issues(first: 100) { nodes { identifier } pageInfo { endCursor hasNextPage } } }' \
  --paginate
```

`--variable` rules:
- starts with `{` `[` or `"` → parsed as JSON.
- starts with a digit or `-` → number.
- equals `true`/`false`/`null` → JSON literal.
- anything else → string.

`--paginate` walks the first `Connection` (any object with both `nodes`
and `pageInfo.endCursor`) up to 50 pages, replaces `nodes` with the
concatenated array, and forces `pageInfo.hasNextPage` to `false`.

## Docs

Every command and error path is locked in by an executable doc-test. See
`Docs/*.md`. Each fenced ``` ```console ``` block is parsed by
`scripts/doc-test.ts` and run against a local emulator. The doc-tests
are the contract; if behaviour changes, the docs must change with it.
