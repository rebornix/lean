# Spec: Testing Strategy — Executable Documentation

## Goal

Every CLI command is documented with its exact invocation and expected output. These docs double as integration tests — a runner extracts the commands, runs them against the Linear emulator, and diffs output.

## Emulator: vercel-labs/emulate (Linear PR #91)

**Source:** `mvanhorn:feat/linear-emulator` branch of `vercel-labs/emulate`
**Port:** `localhost:4012`
**Auth:** `Authorization: lin_api_test`

### Current Coverage (queries only)

- **Types:** Issue, Project, Team, User, Organization, Label, WorkflowState
- **Pagination:** Relay-style (`first`, `after`, `pageInfo`)
- **Seed data:** 1 org, 1 team (ENG), 1 user, 2 workflow states (Todo, In Progress), 1 label (Bug), 1 project (Launch), 1 issue (ENG-1)

### Mutations We Need to Add (fork)

```graphql
type Mutation {
  issueCreate(input: IssueCreateInput!): IssuePayload!
  issueUpdate(id: String!, input: IssueUpdateInput!): IssuePayload!
  commentCreate(input: CommentCreateInput!): CommentPayload!
}
```

**Effort:** ~150 lines of code. The Store already has `insert()` / `update()`. Just need:
1. `LinearComment` entity + `comments` collection
2. `Mutation` type + input types in schema
3. `resolveMutation()` dispatcher in resolvers

## Doc-Test Format

### Approach: Annotated Markdown + Custom Runner

No dominant tool exists for this in Node.js. Build a lightweight runner (~150 LOC) that:
1. Parses markdown files for ```` ```console ```` blocks
2. Extracts `$ lean ...` commands and expected output below
3. Runs against emulator, diffs actual vs expected
4. Supports snapshot update mode (`--update`)

### Document Format

Each doc file in `Docs/` follows this pattern:

````markdown
# Issue List

List issues assigned to you or filter by team, state, priority.

## Basic Usage

```console
$ lean issue list
ID      TITLE         STATUS       ASSIGNEE    PRIORITY
ENG-1   First issue   Todo         Developer   None
```

## Filter by Team

```console
$ lean issue list --team ENG
ID      TITLE         STATUS       ASSIGNEE    PRIORITY
ENG-1   First issue   Todo         Developer   None
```

## JSON Output

```console
$ lean issue list --json id,title,state
[
  {
    "id": "issue-1",
    "title": "First issue",
    "state": "Todo"
  }
]
```
````

### Runner Integration

```bash
# Run all doc tests against emulator
npm run test:docs

# Update snapshots
npm run test:docs -- --update

# Run specific doc
npm run test:docs -- Docs/issue-list.md
```

Under the hood:
1. Start emulator (`npx emulate --service linear`)
2. Extract `$ lean ...` commands from markdown
3. Run each, capture stdout
4. Compare to expected output block
5. Report pass/fail with diff on mismatch

## Advantages

- **Docs are always accurate** — if the CLI changes, tests fail
- **Onboarding** — new contributors read docs that are verified working
- **Agent-friendly** — agents can read the docs to learn the CLI
- **Review-friendly** — PRs changing CLI behavior show doc diffs

## Alternatives Considered

| Approach | Verdict |
|----------|---------|
| Cram | Great format but Python dep, unmaintained |
| bats | Good for bash, not embedded in docs |
| txtar/testscript | Go-specific |
| Jest/Vitest snapshots | Tests separate from docs |
| **Custom markdown runner** | ✅ Best fit — docs ARE tests, ~150 LOC |
