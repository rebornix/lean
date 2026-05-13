# Spec: Agent Surface — `lean usage`, `lean api`, `SKILL.md`

## Goal

Complete the agent-first surface promised by `Specs/agent-first-design.md`
so an LLM agent or scripted client can:

1. **Discover** what `lean` can do in a few hundred tokens, without
   loading the entire `--help` tree.
2. **Escape** to raw GraphQL when the CLI doesn't cover an operation.
3. **Bootstrap** with a single skill document (`SKILL.md`) that fits
   under 2000 tokens.

## UX

### `lean usage` — two-tier discovery

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

All commands support --json. See `Docs/issue-*.md` for examples.
```

```console
$ lean auth usage
lean auth - Authentication

  login   Save a Linear API key (--api-key for headless)
  status  Show the currently authenticated user (--json)
  logout  Remove stored credentials

Env: LINEAR_API_KEY overrides ~/.config/lean/config.json.
```

`lean usage` is intentionally distinct from `lean --help`. `--help` prints
commander's auto-generated tree (verbose, hundreds of tokens). `usage`
prints a hand-curated, token-budgeted summary.

### `lean api` — raw GraphQL escape hatch

```bash
# Inline query
lean api --query '{ viewer { id name } }'

# Query from file
lean api --query-file ops.graphql --variable teamId=team-1

# Pagination
lean api --query '{ issues(first: 100) { nodes { id } pageInfo { endCursor hasNextPage } } }' --paginate

# Mutation
lean api --query 'mutation($id: String!, $input: IssueUpdateInput!) {
  issueUpdate(id: $id, input: $input) { issue { identifier } }
}' --variable id=issue-1 --variable input='{"title":"Renamed"}'
```

#### Flags

| Flag                 | Type     | Required          | Notes                                          |
|----------------------|----------|-------------------|------------------------------------------------|
| `--query <gql>`      | string   | one of            | Inline query string                            |
| `--query-file <p>`   | path     | one of            | Read query from file                           |
| `--variable <kv>`    | repeat   | no                | `key=value`; value JSON-parsed if it starts with `{`/`[`/`"`/digit |
| `--operation <name>` | string   | no                | When the document defines multiple operations  |
| `--paginate`         | boolean  | no                | Walks `pageInfo.endCursor`, merges `nodes`     |
| `--json`             | boolean  | implicit          | Always emits JSON; for parity with other cmds  |

#### Output

Always JSON on stdout:

```json
{
  "data": { ... },
  "errors": [ ... ]   // omitted on success
}
```

Errors from Linear surface as exit code 1 with the JSON `errors` array
preserved in `data` payload. Network/auth errors flow through the
existing `LeanError` reporter (exit 3 / 2).

#### `--paginate` semantics

Only meaningful when the response shape contains a `pageInfo` and a
`nodes` array somewhere. We walk down the response tree to find the
first such Connection-shaped object, repeatedly request with
`{ ...variables, after: endCursor }`, and accumulate `nodes`. Final
output: the original first response with `nodes` replaced by the
concatenated array and `pageInfo.hasNextPage` forced to `false`.
Aborts with `linear_api` (exit 1) if pagination shape isn't found.

### `SKILL.md` — single-file agent reference

Lives at `lean/SKILL.md`. Under 2000 tokens. Sections:

1. **What lean is** (2 sentences)
2. **Authentication** (`LINEAR_API_KEY`, no need for `lean auth login` if
   using env)
3. **Discovery** (`lean usage`, `lean <cmd> usage`)
4. **All commands** (one line each, mirrors `lean usage` output)
5. **Output and errors** (link the JSON shape, exit codes, the rule that
   non-TTY auto-switches errors to JSON)
6. **Filters** (the subset agents will use most: `--state Todo`,
   `--assignee @me`, `--priority N`)
7. **Raw GraphQL escape hatch** (`lean api` with two examples)
8. **Identifier resolution** (`ENG-1` form, UUIDs)
9. **Pointer to `Docs/`** for executable examples

The runner verifies length: fail the build if `SKILL.md` exceeds 2000
tokens (rough heuristic: 1 token ~ 4 chars, so 8000 chars cap). Cheap
guardrail against rot.

## Technical Approach

### `src/commands/usage.ts`

```ts
export function registerUsageCommand(program: Command): void {
  program
    .command("usage")
    .description("Show token-efficient usage for lean or a subcommand")
    .argument("[topic]", "auth | issue | api")
    .action((topic?: string) => {
      const text = topic ? subcommandUsage(topic) : rootUsage();
      console.log(text);
    });
}
```

The text is hand-written constants, not generated from commander, so we
control every word and every token.

Per the spec's two-tier pattern, also alias `lean <cmd> usage`:

```ts
auth.command("usage").action(() => console.log(subcommandUsage("auth")));
issue.command("usage").action(() => console.log(subcommandUsage("issue")));
```

### `src/commands/api.ts`

Wraps `client.client.rawRequest`:

```ts
async function runApi(opts: ApiOpts): Promise<void> {
  const query = opts.queryFile
    ? await readFile(opts.queryFile, "utf-8")
    : opts.query;
  if (!query) throw new LeanError("missing_required_flag", "--query or --query-file is required");

  const variables = parseVariables(opts.variable);
  const client = getClient();

  if (opts.paginate) {
    const data = await paginateRequest(client, query, variables, opts.operation);
    process.stdout.write(JSON.stringify({ data }, null, 2) + "\n");
    return;
  }

  const result = await client.client.rawRequest(query, variables, /*headers*/ undefined);
  const out: Record<string, unknown> = { data: result.data ?? null };
  process.stdout.write(JSON.stringify(out, null, 2) + "\n");
}
```

Errors thrown by `rawRequest` (4xx, GraphQL errors) flow through the
existing top-level reporter; we don't re-implement classification here.

### Variable parsing

`--variable key=value`. Value rules:

| First char | Treated as | Example                       |
|------------|------------|-------------------------------|
| `{` `[`    | JSON       | `--variable input='{"a":1}'`  |
| `"`        | JSON string| `--variable name='"alice"'`   |
| digit / `-`| JSON number| `--variable n=42`             |
| `t`/`f`/`n`+ matches `true`/`false`/`null` | JSON literal |        |
| anything else | string  | `--variable id=issue-1`       |

Repeats build a single object; later keys overwrite earlier.

### Pagination

Locate a `Connection` in the response: the first object containing both
`nodes: Array` and `pageInfo: { endCursor, hasNextPage }`. Re-issue the
query with `variables: { ...prev, after: endCursor }`. Concatenate
`nodes`. Stop when `hasNextPage === false` or after a safety cap of 50
pages.

If no Connection is found in the first response: throw `linear_api`
("no Connection shape found for --paginate").

### `SKILL.md` length check

Add to `scripts/doc-test.ts`: at startup, read `SKILL.md`, fail if
`> 8000` chars. Optionally a separate `scripts/check-skill-length.ts` if
we don't want to couple it to the doc-test runner.

### Doc-tests

#### `Docs/usage.md`
Locks in the exact wording of `lean usage`, `lean issue usage`,
`lean auth usage`, `lean api usage`. These will fail when text drifts —
that's the point.

#### `Docs/api.md`
Covers:
- Inline query for viewer
- Query with `--variable` for issue lookup
- Mutation for `issueUpdate`
- Pagination on `issues`
- Error: `--query` missing
- Error: emulator returns GraphQL errors (e.g. unknown field in strict mode)

## Edge Cases

- **`lean usage <topic>` for unknown topic** → `not_found` error
  (`Unknown usage topic: foo`).
- **`--query` AND `--query-file` both passed** → `invalid_argument`.
- **`--variable` without `=`** → `invalid_argument`.
- **Empty query string** → `invalid_argument`.
- **`--paginate` with a query that has no `pageInfo`** → `linear_api`
  with a clear message.
- **`SKILL.md` over budget** → fail with character count and 8000 cap.
- **Non-TTY `lean usage`** → still prints plain text. Discovery output
  isn't a structured response; it's documentation. (`lean usage --json`
  could return `{commands: [...]}` — defer until an agent asks.)
- **`lean api --paginate` runaway** → 50 page cap, then throw.

## Acceptance Criteria

- [ ] `lean usage`, `lean auth usage`, `lean issue usage`, `lean api usage`
      all print correct text and are doc-tested.
- [ ] `lean api --query '{ viewer { id name } }'` returns a JSON
      `{data: {...}}` envelope.
- [ ] `lean api --query-file path` works.
- [ ] `--variable key=value` parses string, JSON object/array/number/
      true/false/null according to the table above.
- [ ] `lean api --paginate` walks pages, merges nodes, sets
      `pageInfo.hasNextPage` to false.
- [ ] All error paths emit `LeanError` JSON in agent mode, plain text in
      human mode (existing reporter).
- [ ] `SKILL.md` exists and is under 8000 chars.
- [ ] `npm run test:docs` covers usage and api docs end-to-end.
- [ ] No regressions in existing 34 doc-tests.
- [ ] `Decisions.md` gets ADR-006 for two-tier discovery and the choice
      to ship a hand-written usage text rather than auto-generate.
