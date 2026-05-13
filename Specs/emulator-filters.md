# Spec: Real Filter Implementation in the Linear Emulator

## Goal

Make the emulator's `Query.issues` (and related list queries) **actually
apply** the `filter` argument that the Linear SDK passes, instead of
ignoring it. This lets `lean`'s doc-tests verify that the CLI builds the
correct filter shapes — today the tests pass even when filters are
mis-shaped because the emulator returns everything regardless.

## Scope

- Implement filtering on `Query.issues`, `Team.issues`, `User.assignedIssues`,
  `User.createdIssues`, `WorkflowState.issues`, `Project.issues`,
  `Label.issues`. The same shape powers all of them; one helper covers all.
- Implement filtering on `Query.teams`, `Query.users`, `Query.projects`,
  `Query.workflowStates`, `Query.labels` for the subset of fields lean
  needs (team key, user email/isMe, etc.).
- Out of scope: full Linear filter grammar. We implement the operators
  and field paths lean actually uses, plus a small useful subset.

## Filter operators (initial set)

```
{ <field>: { <op>: <value> } }
```

| Op             | Applies to                | Behavior                          |
|----------------|---------------------------|-----------------------------------|
| `eq`           | string, number, boolean   | strict equality                   |
| `neq`          | string, number, boolean   | not equal                         |
| `in`           | string, number            | array membership                  |
| `nin`          | string, number            | array non-membership              |
| `contains`     | string                    | case-insensitive substring        |
| `startsWith`   | string                    | case-insensitive prefix           |
| `endsWith`     | string                    | case-insensitive suffix           |
| `gt`/`gte`     | number                    | numeric comparison                |
| `lt`/`lte`     | number                    | numeric comparison                |
| `null`         | any                       | `{ null: true }` matches null     |

## Field paths (initial set, per entity)

### IssueFilter
| Path                 | Type    | Notes                                 |
|----------------------|---------|---------------------------------------|
| `id`                 | string  | linear_id (UUID)                      |
| `identifier`         | string  | "ENG-1"                               |
| `title`              | string  |                                       |
| `description`        | string  |                                       |
| `priority`           | number  |                                       |
| `state.id`           | string  |                                       |
| `state.name`         | string  |                                       |
| `state.type`         | string  | unstarted/started/completed/...       |
| `team.id`            | string  |                                       |
| `team.key`           | string  |                                       |
| `assignee.id`        | string  |                                       |
| `assignee.email`     | string  |                                       |
| `assignee.isMe`      | boolean | viewer == this user                   |
| `creator.id`         | string  |                                       |
| `creator.email`      | string  |                                       |
| `project.id`         | string  |                                       |
| `project.name`       | string  |                                       |

### TeamFilter
- `id`, `key`, `name`

### UserFilter
- `id`, `email`, `name`, `isMe`

### ProjectFilter
- `id`, `name`, `slugId`

### LabelFilter
- `id`, `name`

### WorkflowStateFilter
- `id`, `name`, `type`

## Logical combinators

Linear supports `and`, `or`, `not`. Implement all three:

```graphql
{ filter: {
    and: [
      { state: { type: { in: ["unstarted", "started"] } } },
      { assignee: { isMe: { eq: true } } }
    ]
  }
}
```

A bare object at any level is implicit `and` over its keys (matches
Linear's behavior). `or` and `not` take arrays / objects respectively.

## "isMe" semantics

`assignee.isMe == true` matches issues where `assignee_id == viewer.id`.
Viewer == first user in the store, mirroring our existing `viewer` query.

## Technical Approach

### New file: `emulate/packages/@emulators/linear/src/filter.ts`

- `applyIssueFilter(issues: LinearIssue[], filter: unknown, ctx: FilterContext): LinearIssue[]`
- One function per entity type (`applyTeamFilter`, `applyUserFilter`, ...).
- Each delegates to a generic `match(value, fieldFilter)` helper that
  switches on operator name.
- A `FilterContext` carries `viewerId` (for `isMe`) and the linear store
  (for relation lookups: `state.name` requires looking up the
  WorkflowState by `state_id`).
- Unknown operators or unknown field paths are **ignored** (return true)
  to stay compatible with future SDK fields. Add a `LEAN_EMULATOR_STRICT`
  env var that flips this to "throw a validation error" — useful for
  catching CLI bugs in lean's tests.

### Resolver wiring

In `resolvers.ts`:

```ts
case "issues": {
  const includeArchived = Boolean(args.includeArchived);
  const filter = args.filter;
  let all = ls.issues.all().filter((issue) => includeArchived || !issue.archived_at);
  if (filter) all = applyIssueFilter(all, filter, makeCtx(ls));
  return list(all, args);
}
```

Same for nested fields like `Team.issues`, `User.assignedIssues`, etc.

### Strict mode

Activate via `LEAN_EMULATOR_STRICT=1`. When set, the emulator's filter
helper throws a `linearError("unknown_filter_field", ...)` for any
unrecognized field path or operator, surfaced to the SDK as a GraphQL
error. The doc-test runner sets this env var by default so any future
filter typo in lean fails loudly.

## Doc-test impact

### Expand `Docs/_seed.yaml`

Add at least 4 issues so filters actually narrow:

```yaml
issues:
  - id: issue-1
    title: First issue           # Todo, Alice, P0
    team: team-eng
    state: state-todo
    assignee: user-alice
    priority: 0
  - id: issue-2
    title: Login bug             # In Progress, Bob, P1
    team: team-eng
    state: state-progress
    assignee: user-bob
    priority: 1
  - id: issue-3
    title: Add dark mode         # Todo, Bob, P3
    team: team-eng
    state: state-todo
    assignee: user-bob
    priority: 3
  - id: issue-4
    title: Refactor API          # Done, Alice, P2
    team: team-eng
    state: state-done
    assignee: user-alice
    priority: 2
```

### Update `Docs/issue-list.md`

Each filter section now expects a narrowed list:

```console
$ lean issue list --state Todo
ID     Title          Priority
─────  ─────────────  ────────
ENG-1  First issue    0       
ENG-3  Add dark mode  3       

$ lean issue list --assignee @me
ID     Title          Priority
─────  ─────────────  ────────
ENG-1  First issue    0       
ENG-4  Refactor API   2       
```

### New emulator tests

In `linear.test.ts`, add a `describe("filters", ...)` block covering:
- `state.name eq`, `state.type in`
- `team.key eq`, `assignee.isMe eq true`
- `assignee.email eq`, `priority eq`, `priority gte`
- combined: `and` / `or` / `not`
- strict mode: unknown field path -> GraphQL error

## Edge Cases

- **No filter**: behave as today (return all).
- **`{}` empty filter**: also return all.
- **Filter on relation that's null**: `{ assignee: { isMe: { eq: true } } }`
  for an unassigned issue → false.
- **Comparing string ops case-insensitively**: `contains`/`startsWith`/
  `endsWith` lowercase both sides; `eq` stays exact.
- **`in` with empty array**: matches nothing (consistent with SQL `IN ()`).
- **Multiple operators on same field**: `{ priority: { gte: 1, lte: 3 } }`
  treated as implicit `and`.
- **Boolean as `eq`**: `{ assignee: { isMe: { eq: true } } }` works.
  Bare `{ assignee: { isMe: true } }` (without `eq`) is also tolerated
  for SDK compatibility.

## Acceptance Criteria

- [ ] `applyIssueFilter` (and siblings) implemented in
      `packages/@emulators/linear/src/filter.ts`.
- [ ] Wired into all `*.issues` resolvers + `Query.{teams,users,...}`.
- [ ] Strict mode env var implemented.
- [ ] At least 8 new emulator unit tests covering operators, field paths,
      combinators, and strict mode.
- [ ] `Docs/_seed.yaml` expanded; `Docs/issue-list.md` updated to verify
      real narrowing.
- [ ] All existing doc-tests still pass.
- [ ] Strict mode is on by default for `npm run test:docs`.
