# Research: Agent Workflow Command Surface

## Source

This research is based on a Codex session audit for the seven-day window
ending 2026-05-23, plus inspection of the locally declared
`@linear/sdk@29.0.0` package surface.

The audit scanned `/Users/penlv/.codex/sessions/**/*.jsonl`, filtered
terminal calls that executed `lean` or Node wrappers that invoked
`spawnSync("lean")`, linked long-running exec sessions to later poll
outputs, and deduplicated repeated resumed context by `call_id`.

## Audit Findings

The audit found 124 unique Lean CLI terminal calls:

| Result | Count |
|---|---:|
| Success | 105 |
| Failure | 19 |
| Unknown | 0 |

Successful calls clustered around a few workflows:

| Pattern | Successful calls |
|---|---:|
| GraphQL issue query | 25 |
| GraphQL issueCreate | 14 |
| `lean issue list` / search with `jq` | 11 |
| `lean issue view` | 9 |
| Help / usage discovery | 9 |
| GraphQL team query | 7 |
| Node wrapper bulk update | 5 |
| `lean project list` | 5 |
| CLI availability checks | 4 |
| Node wrapper bulk create/update | 3 |
| GraphQL issueUpdate | 3 |

The dominant real task was: convert local notes/checklists into Linear
issues, organize them under parent issues, then re-query the Linear tree
to verify state. Agents repeatedly did this sequence:

1. Discover authentication, team IDs, state IDs, project IDs, and viewer
   ID.
2. Search or list existing issues to avoid duplicates.
3. Create or update issues using raw GraphQL because first-class
   commands lacked fields such as `parentId`, `dueDate`, and
   `subIssueSortOrder`.
4. Query the parent issue's children to verify titles, due dates,
   priorities, state, and parent relationships.

The most expensive pattern in agent turns was not one slow API call; it
was the need to write ad hoc GraphQL or Node scripts for common task
management operations.

## Repeated API Shapes

Agents repeatedly used these Linear GraphQL shapes:

```graphql
query($id: String!) {
  issue(id: $id) {
    identifier
    title
    children(first: 100) {
      nodes {
        identifier
        title
        priorityLabel
        dueDate
        state { name }
      }
    }
  }
}
```

```graphql
mutation($input: IssueCreateInput!) {
  issueCreate(input: $input) {
    success
    issue {
      id
      identifier
      title
      url
      dueDate
      parent { identifier }
    }
  }
}
```

```graphql
mutation($id: String!, $input: IssueUpdateInput!) {
  issueUpdate(id: $id, input: $input) {
    success
    issue {
      identifier
      title
      priorityLabel
      dueDate
    }
  }
}
```

Agents also queried:

- `viewer { id email }`
- `teams { nodes { id key name states { nodes { id name type } } } }`
- `team(id) { states { nodes { id name type position } } }`
- `project(id) { ... issues(first: 100) ... }`
- `__type(name: "IssueCreateInput")`
- `__type(name: "IssueUpdateInput")`

The schema introspection calls happened because the higher-level CLI did
not advertise or expose the fields agents needed.

## SDK Findings

`package.json` declares `@linear/sdk` as `^29.0.0`, and
`package-lock.json` resolves it to `29.0.0`.

The SDK supports the important operations needed for this work:

| Need | SDK support |
|---|---|
| Find one issue | `client.issue(id)` |
| List/filter issues | `client.issues({ filter, first, sort })` |
| Search issues | `client.searchIssues(term, { teamId, filter, first })` |
| Get children | `issue.children({ first })` |
| Create issue | `client.createIssue(input)` |
| Update issue | `client.updateIssue(id, input)` |
| Batch update same input | `client.updateIssueBatch(ids, input)` |
| Create comment | `client.createComment(input)` |
| List teams | `client.teams(...)` |
| View team states | `client.team(id).states()` |
| List projects | `client.projects(...)`, `team.projects(...)` |

The SDK input types include the fields agents needed:

- `IssueCreateInput.parentId`
- `IssueCreateInput.projectId`
- `IssueCreateInput.dueDate`
- `IssueCreateInput.stateId`
- `IssueCreateInput.assigneeId`
- `IssueCreateInput.priority`
- `IssueCreateInput.subIssueSortOrder`
- `IssueUpdateInput.parentId`
- `IssueUpdateInput.projectId`
- `IssueUpdateInput.dueDate`
- `IssueUpdateInput.stateId`
- `IssueUpdateInput.assigneeId`
- `IssueUpdateInput.priority`
- `IssueUpdateInput.subIssueSortOrder`
- `IssueUpdateInput.description`

The main limitation is not SDK capability. It is CLI coverage and output
shape. The generated SDK mutation payload fragments often include only
the issue ID before lazy-loading related objects. For commands that need
exactly shaped JSON in one round trip, `client.client.rawRequest` remains
useful.

## Implementation Implications

Prefer SDK helpers for:

- Validating and constructing typed mutation inputs.
- Single issue creates and updates.
- Same-input batch updates.
- Team/project/search discovery commands where the generated models
  already expose the needed fields.

Prefer raw GraphQL for:

- Tree views that need parent and child fields in one response.
- Aliased bulk mutations, if we later choose one network round trip over
  clearer per-item SDK error handling.
- CLI output contracts that require small, stable payloads without SDK
  lazy-loading extra relations.

The first optimization target should be command coverage, not replacing
all raw GraphQL. A single CLI command that internally performs several
SDK calls still removes the agent's need to invent GraphQL or Node
scripts.

