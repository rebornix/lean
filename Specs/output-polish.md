# Spec: List/View Output Polish

## Goal

Tighten the daily-driver output of `lean issue list` and `lean issue
view` so they're useful against a real Linear workspace. Real-world
testing exposed three concrete pain points:

1. `lean issue list` defaults to **all** issues in the workspace (200+
   in the user's case). The original spec said default to "my assigned
   issues"; we never enforced it.
2. The list table omits the two columns a human actually scans for —
   **State** and **Assignee**. Priority is rendered as a raw number
   (`0..4`) instead of a label.
3. `issue view` prints a blank line where the description would go when
   the description is empty, looking like a glitch.

## UX

### `lean issue list` defaults to @me

```console
$ lean issue list
ID       Title                                 State        Priority   Assignee
───────  ───────────────────────────────────  ───────────  ─────────  ────────
HAL-172  research/_template                    Backlog      None       Peng Lyu
HAL-165  Android ASO analysis ...              Backlog      None       Peng Lyu
...
```

### Opt out: see all issues with `--all` or `--assignee anyone`

```console
$ lean issue list --all
... 200+ issues, paginated by --limit ...

$ lean issue list --assignee anyone
... same as --all; explicit form ...
```

`--assignee @me` still works (and stays the default). `--assignee
<email>` filters to that user. `--assignee anyone` removes the assignee
filter altogether (so does `--all`).

### Priority labels

Show Linear's canonical labels:

| Number | Label    |
|--------|----------|
| 0      | None     |
| 1      | Urgent   |
| 2      | High     |
| 3      | Medium   |
| 4      | Low      |

Used in both human table and human `view` output. JSON keeps the
numeric `priority` for stability AND adds `priorityLabel` so JSON
consumers don't have to reimplement the mapping.

### `issue view` enriched

```console
$ lean issue view HAL-172
HAL-172: research/_template
State:    Backlog
Priority: None
Assignee: Peng Lyu
URL:      https://linear.app/halliharp/issue/HAL-172/research-_template

(no description)
```

When the description is empty (`""`) or null, print `(no description)`
on its own line so the layout is consistent. When non-empty, print the
description verbatim.

JSON output gains the same fields:

```json
{
  "id": "HAL-172",
  "title": "research/_template",
  "description": null,
  "state": "Backlog",
  "priority": 0,
  "priorityLabel": "None",
  "assignee": "penn.lv@gmail.com",
  "url": "https://linear.app/halliharp/issue/HAL-172/..."
}
```

`assignee` uses the email; `null` if unassigned.

### `issue list --json` shape gets the same enrichment

```json
[
  {
    "id": "HAL-172",
    "title": "research/_template",
    "state": "Backlog",
    "priority": 0,
    "priorityLabel": "None",
    "assignee": "penn.lv@gmail.com"
  }
]
```

Backwards compatible: the existing `id`, `title`, `priority` fields
keep their meanings; we only add new ones.

### Empty list message

```console
$ lean issue list --state Done --assignee @me
No issues match.
```

Today the table prints just the header row when empty, which looks
broken.

## Technical Approach

### `src/output/priority.ts` (new)

```ts
const LABELS = ["None", "Urgent", "High", "Medium", "Low"];
export function priorityLabel(n: number | null | undefined): string {
  if (n === null || n === undefined || n < 0 || n > 4) return "None";
  return LABELS[Math.floor(n)] ?? "None";
}
```

### `lean issue list` changes

In `src/commands/issue.ts`:

- Add `--all` flag; when set, the assignee filter is omitted.
- Treat the absence of `--assignee` as `--assignee @me`. Pass the
  viewer's id into the filter (use `client.viewer.id` once at the top
  of the command).
- Extend the GraphQL field set used in the issues fetch to also pull
  `state { name }`, `assignee { name email }`.
- Map results:
  - human: 5-column table (ID, Title, State, Priority, Assignee).
    Truncate Title to fit terminal width (today there's no truncation
    beyond a hard 60-char cap; keep that for now).
  - JSON: extend the row schema as described.
- Empty list → `console.log("No issues match.")` in human mode; `[]` in
  JSON.

The existing SDK call uses `client.issues({filter, first})` which
returns SDK `Issue` objects. To pull state/assignee names we'd trigger
secondary fetches (the SDK lazy-loads relations). To keep it one
round-trip, switch this command to a raw GraphQL query similar to
`lookupIssueByIdentifier`.

### `lean issue view` changes

Extend `lookupIssueByIdentifier` to also return state/assignee fields
(rename to `lookupIssue` since it does more now). Then format the
human view with the new lines and consistent description handling.

### Removing the SDK-mediated `client.issues` is fine

We were already using `client.client.rawRequest` for view, create,
edit, close, comment. Aligning `list` removes the last reliance on the
SDK's typed `client.issues` for production code. The SDK stays in the
dependency tree (used for `viewer`, `team`, `team.states`), but the
issue lookups become uniformly raw GraphQL. This is also faster
(smaller fragments, no `Issue` constructor that touches `data.reactions`
etc.).

## Edge Cases

- **No teams configured for the user**: `viewer.id` still works;
  default-to-@me filter narrows to nothing → "No issues match."
- **`--assignee @me --all` combined**: `--all` wins (assignee filter
  dropped). Document this as the explicit override.
- **`assignee` null on a row**: human shows `—`; JSON shows `null`.
- **`state` null on a row**: same — `—` / `null`.
- **Truncation of Title in table**: keep current 60-char cap for now;
  responsive width is a separate spec.
- **Priority field on Linear can in theory be > 4**: defensive — fall
  back to "None".
- **Description that is `""` vs `null`**: both render as `(no
  description)` in human mode; `null` in JSON for `""` too (we
  normalise empty to null in JSON for shape stability).

## Acceptance Criteria

- [ ] `lean issue list` with no flags returns only the viewer's
      assigned issues. Verified by a doc-test that seeds two assignees.
- [ ] `lean issue list --all` (and `--assignee anyone`) returns the
      full set.
- [ ] Human table includes State, Priority (label), Assignee columns.
- [ ] Empty list prints `No issues match.` in human mode and `[]` in
      JSON mode.
- [ ] `issue view` shows State, Priority (label), Assignee, URL on
      their own lines, plus `(no description)` when empty.
- [ ] JSON shapes gain `state`, `priorityLabel`, `assignee` (and
      `url` for view); `priority` and other existing fields unchanged.
- [ ] All existing doc-tests refreshed with `--update`. New doc-tests
      added for `--all`, empty list, and the @me default behaviour.
- [ ] `Decisions.md` ADR-008 records the default-to-@me decision and
      the move of `issue list` to a raw GraphQL query.
