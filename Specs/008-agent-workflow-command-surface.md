# Spec: Agent Workflow Command Surface

## Goal

Reduce the number of Lean CLI calls and raw GraphQL snippets agents need
for common Linear workflows.

Recent session audits show agents repeatedly using `lean api` and
one-off Node scripts to:

1. Discover team, state, project, and viewer IDs.
2. Search existing issues before creating duplicates.
3. Create issues under a parent with due dates, priorities, projects,
   assignees, and sub-issue ordering.
4. Update many existing issues with parent, due date, priority,
   description, or ordering.
5. Re-query a parent issue's children to verify the work.

The goal is to make those workflows first-class, while keeping
`lean api` as the escape hatch for unusual Linear operations.

## UX

### Team and state discovery

Agents currently query `viewer`, `teams`, and `states` manually before
creating or updating issues. Add a small `team` command group.

```console
$ lean team list --json
[
  { "id": "1090...", "key": "HAL", "name": "Halliharp" }
]
```

```console
$ lean team view HAL --states --json
{
  "id": "1090...",
  "key": "HAL",
  "name": "Halliharp",
  "states": [
    { "id": "ebda...", "name": "Todo", "type": "unstarted", "position": 1 },
    { "id": "667d...", "name": "In Progress", "type": "started", "position": 2 },
    { "id": "254d...", "name": "Done", "type": "completed", "position": 3 }
  ]
}
```

Flags:

| Command | Flags |
|---|---|
| `lean team list` | `--json`, `--format text` |
| `lean team view <key>` | `--states`, `--projects`, `--json`, `--format text` |

`team view` accepts a team key or UUID.

### Issue search

Agents often run `lean issue list --json | jq ...` to find likely
duplicates. Add a direct search command.

```console
$ lean issue search "startup perf" --team HAL --json
[
  {
    "id": "HAL-238",
    "title": "VS Code startup perf analysis",
    "state": "Todo",
    "priority": 2,
    "priorityLabel": "High",
    "assignee": "penn.lv@gmail.com",
    "url": "https://linear.app/..."
  }
]
```

Flags:

| Flag | Notes |
|---|---|
| `--team <key>` | Limits search to one team |
| `--state <name>` | Optional workflow state filter |
| `--assignee <@me|anyone|email>` | Same semantics as `issue list` |
| `--limit <n>` | Defaults to 25 |
| `--json`, `--format text` | Same output contract as other commands |

The command uses Linear search when a query is provided. A future
enhancement can add `issue list --title-contains <text>` for exact title
filtering; that is not required for this spec.

### Issue children and tree views

Agents repeatedly verify parent/child issue state after bulk operations.
Add child inspection commands.

```console
$ lean issue children HAL-204 --json
[
  {
    "id": "HAL-218",
    "title": "Send email to Kai",
    "state": "Done",
    "priority": 1,
    "priorityLabel": "Urgent",
    "assignee": "penn.lv@gmail.com",
    "dueDate": "2026-05-22",
    "url": "https://linear.app/..."
  }
]
```

```console
$ lean issue tree HAL-204 --json
{
  "id": "HAL-204",
  "title": "VS Code offboard / transition work",
  "state": "Todo",
  "priority": 1,
  "priorityLabel": "Urgent",
  "assignee": "penn.lv@gmail.com",
  "dueDate": "2026-05-29",
  "url": "https://linear.app/...",
  "children": [ ... ]
}
```

Flags:

| Flag | Notes |
|---|---|
| `--limit <n>` | Defaults to 100 |
| `--state <name>` | Optional child state filter |
| `--json`, `--format text` | Same output contract |

`tree` is one level deep in this spec. Recursive trees can be added
later if real usage demands it.

### Rich issue create

Extend `lean issue create` so common agent fields no longer require
`lean api`.

```console
$ lean issue create \
  --team HAL \
  --title "VS Code startup perf analysis" \
  --description-file /tmp/body.md \
  --parent HAL-204 \
  --project Research \
  --due-date 2026-05-27 \
  --priority High \
  --assignee @me \
  --state Todo \
  --sub-issue-sort-order 970 \
  --json
{
  "id": "HAL-238",
  "title": "VS Code startup perf analysis",
  "url": "https://linear.app/...",
  "parent": "HAL-204",
  "project": { "id": "...", "name": "Research", "slugId": "...", "state": "started", "team": "HAL" },
  "dueDate": "2026-05-27",
  "priority": 2,
  "priorityLabel": "High",
  "state": "Todo",
  "assignee": "penn.lv@gmail.com"
}
```

New or expanded flags:

| Flag | Notes |
|---|---|
| `--parent <issue>` | Identifier or UUID; resolves to `parentId` |
| `--due-date <YYYY-MM-DD>` | Sets `dueDate` |
| `--sub-issue-sort-order <number>` | Sets child order under parent |
| `--priority <0-4|None|Urgent|High|Medium|Low>` | Accept labels as well as numbers |

Existing `--project`, `--state`, and `--assignee` behavior remains.

### Rich issue edit

Extend `lean issue edit` to cover the fields agents used raw GraphQL
for.

```console
$ lean issue edit HAL-218 --due-date 2026-05-22 --priority Urgent --json
{
  "id": "HAL-218",
  "title": "Send email to Kai",
  "dueDate": "2026-05-22",
  "priority": 1,
  "priorityLabel": "Urgent"
}
```

New flags:

| Flag | Notes |
|---|---|
| `--description <text>` | Replaces the description |
| `--description-file <file>` | Replaces the description from a file |
| `--due-date <YYYY-MM-DD>` | Sets `dueDate` |
| `--parent <issue>` | Moves under the parent issue |
| `--no-parent` | Clears the parent |
| `--project <project>` | Sets project by id, name, slugId, or unique partial name |
| `--no-project` | Clears project |
| `--sub-issue-sort-order <number>` | Sets child order under parent |

`--no-parent` and `--parent` are mutually exclusive. `--no-project` and
`--project` are mutually exclusive.

### Bulk create

Agents repeatedly wrote Node wrappers to create many issues from a
checklist. Add a JSON-file based command.

```console
$ lean issue bulk-create --file /tmp/issues.json --json
{
  "created": [
    { "id": "HAL-222", "title": "Confirm resignation is entered in Employee Central", "url": "https://linear.app/..." },
    { "id": "HAL-223", "title": "Update personal contact info and save personnel number", "url": "https://linear.app/..." }
  ],
  "failed": []
}
```

Input shape:

```json
{
  "defaults": {
    "team": "HAL",
    "parent": "HAL-204",
    "state": "Todo",
    "assignee": "@me",
    "priority": "High",
    "dueDate": "2026-05-29"
  },
  "issues": [
    {
      "title": "Confirm resignation is entered in Employee Central",
      "description": "Watch for the automated offboarding email.",
      "dueDate": "2026-05-22",
      "priority": "Urgent",
      "subIssueSortOrder": 1000
    }
  ]
}
```

Rules:

- `defaults` are optional.
- Per-issue fields override defaults.
- `team` and `title` must be present after merging defaults.
- `descriptionFile` may be used instead of `description`.
- The command creates issues sequentially in this spec so partial
  failure reporting is clear.
- Exit 0 if all issues succeed.
- Exit 1 if any issue fails; still print `created` and `failed` in JSON.
- `--continue-on-error` controls whether the command stops at the first
  failure or attempts the remaining issues. Default: stop at first
  failure.

### Bulk edit

Agents also wrote wrappers to update many issues' due dates, priority,
parent, description, and ordering.

```console
$ lean issue bulk-edit --file /tmp/updates.json --json
{
  "updated": [
    { "id": "HAL-218", "title": "Send email to Kai" },
    { "id": "HAL-222", "title": "Confirm resignation is entered in Employee Central" }
  ],
  "failed": []
}
```

Input shape:

```json
{
  "updates": [
    {
      "id": "HAL-218",
      "dueDate": "2026-05-22",
      "priority": "Urgent"
    },
    {
      "id": "HAL-222",
      "parent": "HAL-204",
      "subIssueSortOrder": 999
    }
  ]
}
```

Rules:

- `id` accepts an issue identifier or UUID.
- `descriptionFile` may be used instead of `description`.
- Per-issue updates can differ.
- If all updates share the same exact input and all IDs are UUIDs, the
  implementation may use `updateIssueBatch`.
- Otherwise, update sequentially with per-item reporting.
- Exit and `--continue-on-error` semantics match `bulk-create`.

## Technical Approach

### Shared issue API helpers

Create `src/api/issues.ts` to hold reusable issue operations:

- `lookupIssue(reference)` for UUID or team-number identifiers.
- `resolveIssueId(reference)` returning the Linear UUID.
- `resolveAssigneeId(reference)` for `@me` or email.
- `resolveStateId(teamId, stateName)`.
- `parsePriority(value)` accepting `0..4` and labels.
- `validateDueDate(value)` for `YYYY-MM-DD`.
- `issuePayload(issue)` for the stable JSON shape used by list, view,
  search, children, create, and edit.

Move existing issue lookup logic out of `src/commands/issue.ts` instead
of duplicating it.

### SDK usage policy

Use the SDK where it removes schema guesswork:

- `client.createIssue(input)` for single issue creation.
- `client.updateIssue(id, input)` for single issue updates.
- `client.updateIssueBatch(ids, input)` only for same-input bulk edits.
- `client.searchIssues(term, vars)` for `issue search`.
- `client.teams`, `client.team`, `team.states`, and `team.projects` for
  team discovery.

Keep raw GraphQL for one-round-trip, stable-output queries:

- `issue children`
- `issue tree`
- Any command that must return parent and child fields without SDK
  lazy-loading.

This balances ADR-003's SDK preference with the later real-world lesson
from ADR-008 that small raw GraphQL fragments can be better for stable
CLI output.

### Command registration

Add `src/commands/team.ts` and register it from `src/index.ts`.

Extend `src/commands/issue.ts` with:

- `search`
- `children`
- `tree`
- expanded `create` flags
- expanded `edit` flags
- `bulk-create`
- `bulk-edit`

Keep every command's `--json` / `--format` behavior consistent with
ADR-009.

### Bulk input validation

Bulk commands read a JSON file and validate before mutating:

1. Parse JSON.
2. Validate top-level shape.
3. Merge defaults into each item.
4. Resolve team, state, assignee, parent, and project references.
5. Validate dates, priorities, and sort orders.
6. Execute mutations.

If validation fails before any mutation, no issues are changed. If a
mutation fails after earlier mutations have succeeded, do not attempt
rollback; report partial success clearly.

### Output contract

All new JSON outputs should use the same issue fields where available:

```ts
interface IssueJson {
  id: string;
  title: string;
  description?: string | null;
  state?: string | null;
  priority?: number | null;
  priorityLabel?: string | null;
  assignee?: string | null;
  parent?: string | null;
  project?: Record<string, string | null> | null;
  dueDate?: string | null;
  url?: string;
}
```

Bulk outputs should be predictable:

```ts
interface BulkResult<T> {
  created?: T[];
  updated?: T[];
  failed: Array<{
    index: number;
    title?: string;
    id?: string;
    error: string;
    message: string;
  }>;
}
```

## Edge Cases

- **Identifier vs UUID**: All issue-reference flags accept either. The
  implementation resolves identifiers before mutation.
- **Parent without team**: A child still needs `team`. If omitted, do
  not infer team from parent in this spec; require `--team` or default
  `team` in bulk input. This avoids surprising cross-team behavior.
- **Project reference without team**: Existing project resolution is
  team-scoped. Require team when resolving project names or partials.
- **Priority labels**: Accept labels case-insensitively. Reject unknown
  labels with `invalid_argument`.
- **Due date format**: Accept only `YYYY-MM-DD`; reject natural language
  dates.
- **Empty bulk file**: Exit 1 with `invalid_argument`.
- **Partial bulk failure**: Report `created` / `updated` and `failed`.
  Do not roll back successful operations.
- **`--continue-on-error` with validation errors**: Shape-level
  validation still fails before mutations. Per-item resolution or
  mutation failures can continue.
- **Search result type**: Linear search returns `IssueSearchResult`
  models. Map them into the same issue JSON shape.
- **Large trees**: `issue tree` is one level deep and defaults to 100
  children. Users can raise `--limit`; recursive traversal is out of
  scope.

## Acceptance Criteria

- [ ] `lean team list --json` returns team id, key, and name.
- [ ] `lean team view HAL --states --json` returns workflow state id,
      name, type, and position.
- [ ] `lean issue search <query> --team HAL --json` returns matching
      issues without requiring `jq`.
- [ ] `lean issue children HAL-204 --json` returns one-level child issue
      rows with state, priority label, assignee, due date, and URL.
- [ ] `lean issue tree HAL-204 --json` returns the parent issue plus
      one-level children.
- [ ] `lean issue create` supports `--parent`, `--due-date`,
      `--sub-issue-sort-order`, and priority labels.
- [ ] `lean issue edit` supports description replacement, due date,
      parent, project, and sub-issue order fields.
- [ ] `lean issue bulk-create --file` creates multiple issues with
      defaults, per-item overrides, and partial-failure reporting.
- [ ] `lean issue bulk-edit --file` updates multiple issues with
      per-item updates and partial-failure reporting.
- [ ] All new commands support non-TTY JSON by default, `--json`, and
      `--format text`.
- [ ] Docs are added or updated under `Docs/` with executable console
      examples for search, children/tree, rich create/edit, and bulk
      workflows.
- [ ] `README.md`, `SKILL.md`, and plugin skill docs are updated for
      user-visible command changes.
- [ ] Doc-tests cover happy paths and at least one validation failure
      for each new command group.
- [ ] `Decisions.md` records the SDK/raw-GraphQL policy for this command
      surface before implementation lands.

