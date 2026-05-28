# Spec: Issue Comment Command Surface

## Goal

Make issue comments readable and manageable without dropping to
`lean api`, while preserving the existing add-comment shorthand.

## UX

Use singular `comment` to match the existing command:

```bash
lean issue comment add HAL-194 --body "Progress update"
lean issue comment list HAL-194 --json
lean issue comment view <comment-id> --json
lean issue comment edit <comment-id> --body-file /tmp/comment.md
lean issue comment delete <comment-id> --confirm
```

Keep the existing command as an alias:

```bash
lean issue comment HAL-194 --body "Progress update"
```

equivalent to:

```bash
lean issue comment add HAL-194 --body "Progress update"
```

## Output

`list` returns stable comment rows:

```json
[
  {
    "id": "comment-id",
    "issue": "HAL-194",
    "body": "Progress update",
    "user": "penn.lv@gmail.com",
    "createdAt": "2026-05-25T22:36:44.436Z",
    "updatedAt": "2026-05-25T22:36:44.436Z"
  }
]
```

`add`, `view`, and `edit` return one comment object. `delete` returns:

```json
{ "id": "comment-id", "deleted": true }
```

## Rules

- `add` and `edit` require exactly one of `--body` or `--body-file`.
- Empty comment bodies fail with `invalid_argument`.
- `list` defaults to `--limit 25`; pagination can be added later.
- `delete` requires `--confirm` in non-TTY mode.
- `view`, `edit`, and `delete` operate on comment IDs, not fuzzy text.
- All subcommands support `--json` and `--format text`.

## Technical Approach

- Add comment helpers in `src/api/issues.ts` or a small
  `src/api/comments.ts`.
- Use Linear comment operations through the SDK/raw GraphQL client:
  `commentCreate`, `commentUpdate`, `commentDelete`, and issue
  `comments(first:)`.
- Keep command registration under `src/commands/issue.ts`.
- Update `Docs/issue-comment.md`, `README.md`, `SKILL.md`, plugin skill
  docs, and `lean issue usage`.

## Acceptance Criteria

- [x] `lean issue comment list HAL-194 --json` returns comment IDs,
      bodies, authors, and timestamps.
- [x] `lean issue comment add HAL-194 --body-file /tmp/body.md --json`
      creates a comment.
- [x] Existing `lean issue comment HAL-194 --body ...` still works.
- [x] `lean issue comment view <comment-id> --json` returns one comment.
- [x] `lean issue comment edit <comment-id> --body ... --json` updates
      the comment body.
- [x] `lean issue comment delete <comment-id> --confirm --json` deletes
      the comment.
- [x] Missing body, empty body, missing comment, and unconfirmed delete
      return structured errors.
- [x] Docs and doc-tests cover list/add/view/edit/delete plus one error
      path.
