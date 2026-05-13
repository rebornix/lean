# Architectural Decision Log

> Append-only. Never edit past entries. To reverse a decision, add a new entry referencing the original.

## Template

```
### ADR-NNN: Title
**Date**: YYYY-MM-DD
**Status**: Accepted | Superseded by ADR-NNN
**Context**: Why was a decision needed?
**Decision**: What was decided?
**Consequences**: What follows from this?
```

---

### ADR-001: CLI Framework — Commander
**Date**: 2026-05-07
**Status**: Accepted
**Context**: Need a subcommand router. Options: commander, yargs, oclif, clipanion.
**Decision**: Use `commander` — lightweight, widely used, simple API, good TypeScript support.
**Consequences**: No plugin system (oclif has one), but we don't need it. Easy to migrate if needed.

### ADR-002: Interactive Prompts — @inquirer/prompts
**Date**: 2026-05-07
**Status**: Accepted
**Context**: Need interactive selection for states, assignees, labels. Options: @inquirer/prompts, @clack/prompts, Ink.
**Decision**: Use `@inquirer/prompts` for pickers. Reserve Ink only if we need complex multi-pane TUI later.
**Consequences**: Lighter dependency. Good fuzzy-filter select. Falls back gracefully in non-TTY.

### ADR-003: Use @linear/sdk over raw GraphQL
**Date**: 2026-05-07
**Status**: Accepted
**Context**: Could use raw curl/fetch to Linear GraphQL API, or use official SDK.
**Decision**: Use `@linear/sdk` — auto-generated, typed, well-maintained (weekly releases).
**Consequences**: Larger dependency but full type safety, pagination helpers, no hand-written queries.

### ADR-004: Config location ~/.config/lean/
**Date**: 2026-05-07
**Status**: Accepted
**Context**: Need to store API key and preferences.
**Decision**: Store config in `~/.config/lean/config.json` following XDG convention.
**Consequences**: Consistent with gh, git, and other CLI tools on Linux/macOS.

### ADR-005: Structured errors and exit code policy
**Date**: 2026-05-09
**Status**: Accepted
**Context**: Every command needs predictable, machine-readable error
output so agents and CI scripts can branch on failure cause. Mixing free
text errors and `process.exit(1)` everywhere prevents that.
**Decision**:
- All errors flow through a single `LeanError` class (`src/errors.ts`)
  with a stable `LeanErrorCode` union.
- A top-level handler (`src/reporter.ts`) classifies caught errors,
  formats per output mode, and is the only site that calls
  `process.exit`.
- Agent mode (non-TTY stdout, or `--json`) emits errors as JSON on stderr
  with shape `{error, message, action?, exit_code, details?}`. Human mode
  prints `Error:` / `Hint:` lines.
- Exit codes: 0 success, 1 user error, 2 auth, 3 network, 4 internal.
- Prompts must be gated behind `process.stdin.isTTY`; non-TTY callers get
  `prompt_required_in_non_tty` (exit 1).
**Consequences**: Refactor every command's error sites to throw
`LeanError`. Doc-tests in `Docs/errors.md` lock in the contract.

### ADR-006: Two-tier discovery + raw GraphQL escape hatch
**Date**: 2026-05-10
**Status**: Accepted
**Context**: LLM agents and scripts need a token-efficient way to learn
the CLI without loading the whole `--help` tree, and a way to reach
Linear features the CLI hasn't surfaced.
**Decision**:
- Ship `lean usage` and `lean <cmd> usage` as **hand-written**
  text constants. They are intentionally distinct from `--help` (which
  remains commander's auto-generated tree) so we can budget tokens and
  hand-pick what to highlight.
- Ship `lean api` as a thin wrapper over the SDK's raw GraphQL client.
  Variables follow a pragmatic typing rule (`{` `[` `"` digit / boolean
  literal -> JSON; otherwise string). `--paginate` finds the first
  `Connection` shape in the response, walks `endCursor`, and merges.
- Ship `SKILL.md` at the repo root as a single-file (under 8000 chars)
  agent reference. The doc-test runner enforces the cap.
**Consequences**: Adds two new commands and a top-level skill file. No
runtime dependencies added; everything reuses existing infrastructure
(LeanError, reporter, raw GraphQL client). Future CLI growth must keep
the usage texts truthful — `Docs/usage.md` is the regression test.

### ADR-007: Vendor the Linear emulator as a squashed subtree
**Date**: 2026-05-10
**Status**: Accepted
**Context**: `lean` depends on a forked Linear emulator (PR #91 of
`vercel-labs/emulate`, with our `lean-extensions` adding mutations,
admin endpoints, SDK-compat fixes, and real filters). The fork lives on
a private branch we cannot push upstream. We need it backed up alongside
`lean` so checking out `research` is enough to run the doc-tests.
**Decision**:
- Vendor the fork into `research/emulate/` as a **squashed git subtree**.
- Keep a standalone working clone at `~/Code/external/lean-emulator` for
  incremental dev so editors aren't fighting the squash.
- The standalone clone is the source of truth for *changes*; the
  vendored subtree is the source of truth for *backup*.
- `lean/scripts/doc-test.ts` defaults `LEAN_EMULATOR_DIR` to `../emulate`
  so the in-repo subtree is what runs by default. Anyone who clones
  `research` runs `pnpm install && pnpm build` in `emulate/` and then
  `npm run test:docs` in `lean/`; no other dependencies.
**Consequences**:
- Updating the emulator is a two-step workflow: edit in the standalone
  clone, then `git subtree pull --prefix=emulate <local-path>
  lean-extensions --squash` from inside `research`.
- We never run `git subtree push`. The branch stays local-only.
- The full process is documented in `lean/AGENTS.md` under "Emulator".

### ADR-008: List/view output polish + default to @me
**Date**: 2026-05-11
**Status**: Accepted
**Context**: Real-world testing against a 200+ issue Linear workspace
revealed that `lean issue list`'s "show everything" default is unusable
in practice and the table omits the columns a human actually scans
(State, Assignee). Priority shown as a raw number is unfriendly.
**Decision**:
- `lean issue list` defaults to issues assigned to the viewer.
  `--all` (or `--assignee anyone`) opts out.
- Human table includes ID, Title, State, Priority (label), Assignee.
- Priority labels: 0 None, 1 Urgent, 2 High, 3 Medium, 4 Low.
- `lean issue view` shows State, Priority, Assignee, URL on labelled
  lines, plus `(no description)` consistently when the body is empty.
- JSON output for both gains `state`, `priorityLabel`, `assignee`
  (and `url` for view). The numeric `priority` field stays so JSON
  consumers don't break.
- `issue list` is now a single raw GraphQL query (was the SDK's typed
  `client.issues({filter})`); the SDK is still used for `viewer` and
  `team.states()`. Aligns the issue command surface on raw queries
  for predictability and smaller fragments.
**Consequences**: Every existing list/view doc-test snapshot was
refreshed via `--update`. New doc-tests cover `--all`, `--assignee
anyone`, `--assignee <email>`, and the empty-list message. Real-Linear
verified against api.linear.app.
