# Spec: Project Lifecycle Command Surface

## Goal

Make common project updates first-class in `lean`, especially project
lifecycle state changes such as moving a project to started, completed,
paused, or canceled.

The immediate workflow this unlocks is:

```bash
lean project edit Research --team HAL --state started --json
lean issue close HAL-194 --json
```

instead of mixing a high-level issue command with a raw GraphQL project
mutation.

The broader goal is to clarify the design principle for command growth:
`lean` should be task-oriented, not a generic CRUD generator, but it
also should not invent a parallel vocabulary for Linear. It should expose
common actions in the smallest command surface that fits the work, use
`edit` for general partial updates, and keep `lean api` for unusual or
unsupported GraphQL.

## UX

### Project view

Add a direct way to inspect one project before or after edits.

```console
$ lean project view Research --team ENG --json
{
  "id": "project-research",
  "name": "Research",
  "slugId": "research",
  "state": "planned",
  "team": "ENG"
}
```

`project view` accepts a project id, exact name, slugId, or unique
partial name. If the reference is not an id or slugId and could be
ambiguous, require `--team`.

Flags:

| Flag | Notes |
|---|---|
| `--team <key>` | Scope name/slug/partial resolution |
| `--json`, `--format text` | Same output contract as other commands |

### Project edit

`project edit` is the canonical partial update command.

```console
$ lean project edit Research --team ENG --state started --json
{
  "id": "project-research",
  "name": "Research",
  "slugId": "research",
  "state": "started",
  "team": "ENG"
}
```

Initial flags:

| Flag | Notes |
|---|---|
| `--team <key>` | Required for ambiguous project references |
| `--name <text>` | Rename the project |
| `--description <text>` | Replace description |
| `--description-file <path>` | Replace description from file |
| `--state <state>` | Set lifecycle state using Linear state values |
| `--target-date <YYYY-MM-DD>` | Set target date |
| `--json`, `--format text` | Same output contract |

Future flags can add `--lead`, `--priority`, `--start-date`, and
project status selection once resolution and emulator coverage exist.

If no editable fields are provided, fail with `invalid_argument`.

### Lifecycle aliases

Do not add lifecycle alias commands in the initial scope.

Commands such as `lean project start <project>` or
`lean project complete <project>` are easy to add later, but they create
more vocabulary for users and agents to learn. The first implementation
should prove that `project edit --state <state>` removes the raw GraphQL
need. Add aliases only if session audits show agents repeatedly trying
or wishing for those exact commands.

### Issue aliases

Do not add `issue complete` in this spec.

`issue close` already exists and is documented. A future alias can be
considered if usage data shows that "complete" is a repeated source of
friction, but this project-focused work should not expand the issue
surface unnecessarily.

## State Vocabulary

Accept Linear project state values case-insensitively:

| Input | API state |
|---|---|
| `backlog` | `backlog` |
| `planned` | `planned` |
| `started` | `started` |
| `paused` | `paused` |
| `completed` | `completed` |
| `canceled` | `canceled` |

Do not add broad synonym support in the first implementation. The CLI
can print a helpful error that lists accepted values when a user passes a
display phrase such as `in-progress` or `done`.

JSON output should keep the current raw `state` field. Human output
should match the existing project list vocabulary unless Linear-specific
status labels are returned by the API.

## Command Design Principle

This feature should follow a three-layer command model, with a high bar
for new verbs:

1. Existing resource actions for common operations.
   Examples: `list`, `view`, `create`, `edit`, `close`.
2. `edit` for mutable resource patching.
   Examples: `issue edit --state Done`, `project edit --state started`.
3. `api` for unsupported or uncommon GraphQL.
   Examples: custom project status experiments, labels, relations, or
   fields not yet promoted into the CLI.

This is close to CRUD, but intentionally not pure CRUD. Linear users do
not usually think "update project row"; they think "change the project
state" or "move this issue to Done." The CLI should support those tasks
without forcing raw GraphQL, while avoiding a bespoke synonym set that
drifts from Linear.

Do not add broad `create/read/update/delete` aliases unless the domain
language is unclear. Do not add convenience lifecycle verbs unless they
are backed by observed repeated usage. The preferred resource/action
names are:

- `list`
- `view`
- `create`
- `edit`
- existing domain verbs such as `close`
- `api` for raw GraphQL

## Technical Approach

### Project API helpers

Extend `src/api/projects.ts` with:

- `resolveProject(client, reference, opts)` for id/name/slug/partial
  lookup across one team or all teams.
- `parseProjectState(value)` to validate and normalize Linear state
  strings.
- `viewProject(client, projectId)` for one stable payload.
- `updateProject(client, projectId, input)` for mutation plus stable
  output.

The command layer should not construct GraphQL strings directly.

### API usage

Use a raw GraphQL helper under `src/api/projects.ts` for the initial
implementation, because the CLI needs stable, minimal output in one
round trip and may need to pass explicit `null` for timestamp fields
when moving a project out of a terminal state.

The helper should still use the SDK client's `client.rawRequest`, so
authentication, transport, and error handling stay inside the existing
SDK boundary.

Expected mutation shape:

```graphql
mutation UpdateProject($id: String!, $input: ProjectUpdateInput!) {
  projectUpdate(id: $id, input: $input) {
    project {
      id
      name
      slugId
      state
      team { id key }
    }
  }
}
```

### Terminal state cleanup

When moving away from terminal states, include null timestamp fields
where Linear needs them:

- state becomes `started`, `planned`, `paused`, or `backlog`:
  set `completedAt: null` and `canceledAt: null` when supported.
- state becomes `completed`:
  set `canceledAt: null`; Linear can set `completedAt`.
- state becomes `canceled`:
  set `completedAt: null`; Linear can set `canceledAt`.

If the API rejects a timestamp field because a backend does not support
it, retry once with only `state` and report the project payload. The
emulator should eventually grow these fields so retry behavior can be
tested without hitting the real API.

### Command registration

Expand `src/commands/project.ts`:

- Keep `list`.
- Add `view`.
- Add `edit`.

Update `src/commands/usage.ts`, `README.md`, `SKILL.md`, and the plugin
skill file so agents discover the new commands before reaching for
`lean api`.

### Docs and tests

Add executable docs:

- `Docs/project-view.md`
- `Docs/project-edit.md`

Doc-test coverage should include:

- view by name within a team
- edit state from `planned` to `started`
- edit state from `started` to `completed`
- invalid state value
- missing edit fields
- ambiguous project reference

Add or update emulator support only where required by the docs.

## Edge Cases

- **Ambiguous project names**: Fail with `invalid_argument` and show
  candidate ids, slugIds, names, states, and teams.
- **Project not found**: Fail with `not_found` and suggest `project list`.
- **State value typo**: Fail with `invalid_argument` and list accepted
  states.
- **No edit fields**: Fail before making an API call.
- **Description source conflict**: `--description` and
  `--description-file` are mutually exclusive.
- **Already in target state**: Treat as success and return the current
  project payload.
- **Deprecated `state` vs modern `statusId`**: Keep the CLI contract in
  Linear lifecycle terms. Internals may switch from `state` to `statusId`
  later without changing command names.

## Acceptance Criteria

- [ ] `lean project view Research --team ENG --json` returns one project.
- [ ] `lean project edit Research --team ENG --state started --json`
      updates the project to API state `started`.
- [ ] `lean project edit Research --team ENG --state completed --json`
      updates the project to `completed`.
- [ ] Project JSON includes `id`, `name`, `slugId`, `state`,
      and `team`.
- [ ] Invalid states, missing edit fields, and ambiguous project
      references return structured errors.
- [ ] New command help and `lean project usage` mention the view and
      edit commands.
- [ ] Docs, README, root `SKILL.md`, and plugin skill docs are updated.
- [ ] `npm run check` passes against the local emulator.
