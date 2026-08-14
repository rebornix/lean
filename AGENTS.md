# AGENTS.md — Agent Guide for `lean`

> This file is the single source of truth for any AI agent working on this project.
> Read this **first** before making changes.

## What is `lean`?

`lean` is a CLI for **Linear** (linear.app) — a project management tool. It provides subcommand-based access to Linear's GraphQL API with interactive TUI pickers for multi-step operations.

## Design Philosophy

1. **Human-first, agent-compatible** — Great interactive UX with `--json` for scripting
2. **GH CLI patterns** — Familiar `lean <resource> <action>` structure
3. **Progressive disclosure** — Flags for CI, prompts for humans (auto-detect TTY)
4. **Short-lived TUI** — Ephemeral pickers for selection, not persistent full-screen

## Tech Stack

- **Language**: TypeScript (strict mode)
- **Runtime**: Node.js
- **CLI framework**: commander (subcommand routing)
- **Interactive prompts**: @inquirer/prompts (select, multi-select, confirm)
- **Output**: tty-table or custom formatter + JSON mode
- **API**: @linear/sdk (official GraphQL SDK)
- **Build**: tsc
- **Package manager**: npm

## Project Structure

```
lean/
├── AGENTS.md            # This file
├── Decisions.md         # Architectural Decision Log (append-only)
├── README.md            # User-facing docs
├── Docs/                # Usage guides, tutorials
├── Specs/               # Research, feature specs (pre-implementation)
├── src/
│   ├── index.ts         # Entry point, commander setup
│   ├── commands/        # One file per resource (issue.ts, project.ts, etc.)
│   ├── api/             # Linear API client wrapper
│   ├── output/          # Formatters (table, json, template)
│   ├── prompts/         # Interactive TUI pickers
│   ├── config/          # Auth + config management (~/.config/lean/)
│   └── utils/           # Shared utilities
├── tests/               # Test files
├── package.json
└── tsconfig.json
```

## Workflow for Agents

### Adding a New Feature

1. **Research first** → Add findings to `Specs/<topic>-research.md` (Linear API behaviour, design patterns, prior art) before settling on a shape.
2. **Write a spec** → Create `Specs/<feature-name>.md`
3. **Log decisions** → Append to `Decisions.md`
4. **Implement** → Write code in `src/`
5. **Add doc-tests** → Update or add `Docs/<topic>.md`
6. **Update other docs** → Update `README.md`, `SKILL.md` if user-visible

### Spec Format

Each spec should contain:
- **Goal**: What problem does this solve?
- **UX**: How does the user interact with it?
- **Technical Approach**: Implementation strategy
- **Edge Cases**: What could go wrong?
- **Acceptance Criteria**: How do we know it's done?

### Code Conventions

- Strict TypeScript (`strict: true`)
- Named exports (no default exports)
- Prefer `interface` over `type` for object shapes
- Commands are self-contained files in `src/commands/`
- Every command supports `--json` flag for machine output

## Command Structure (Initial Scope)

```
lean auth login|status|logout
lean project list [--team] [--state] [--limit] [--json]
lean issue list [--team] [--assignee @me] [--state] [--priority] [--limit] [--json]
lean issue create [--team] [--title] [--description] [--assignee] [--priority] [--state] [--project]
lean issue view <ID> [--json] [--web]
lean issue edit <ID> [--title] [--state] [--assignee] [--priority]
lean issue close <ID>
lean issue comment <ID> [--body]
lean config set|get <key> <value>
```

## Build & Run

```bash
npm install
npm run build
node dist/index.js issue list
# or via npm link:
lean issue list
```

## Testing

`lean` uses **executable doc-tests**: every `console` block in `Docs/*.md`
is run against a local emulator. The doc-tests are the contract.

```bash
npm run test:docs              # all doc-tests (boots emulator subprocess)
npm run test:docs -- --update  # rewrite expected output blocks in place
```

## Code quality

The lint/format stack mirrors `linear/linear`'s monorepo so the SDK we
depend on and our own code share conventions:

- **ESLint v9** with `typescript-eslint` (flat config in
  `eslint.config.mjs`, type-aware via `tsconfig.lint.json`).
- **Prettier 3** with the same `.prettierrc` as Linear.
- **`tsc --noEmit`** for type-check.

```bash
npm run lint           # eslint --max-warnings 0 .
npm run lint:fix       # auto-fix what it can
npm run format         # prettier --write .
npm run format:check   # prettier --check .
npm run type-check     # tsc --noEmit
npm run check          # lint + format:check + type-check + test:docs
```

Run `npm run check` before opening a PR. CI should run the same.

## Emulator (Linear)

`lean` does not talk to api.linear.app during development or testing. It
talks to a local fork of
[`vercel-labs/emulate`](https://github.com/vercel-labs/emulate) that
adds the mutations, admin reset/seed endpoints, and real filter
implementation we need. The fork lives at
[`rebornix/emulate`](https://github.com/rebornix/emulate), branch
`lean-extensions`.

`scripts/doc-test.ts` finds the emulator via the `LEAN_EMULATOR_DIR`
environment variable (defaults to `../emulate`). It spawns the emulator
with `LEAN_EMULATOR_STRICT=1` so unknown filter shapes raise GraphQL
errors instead of silently returning all rows.

### First-time setup

Clone the emulator next to your `lean` checkout and build it:

```bash
git clone --branch lean-extensions https://github.com/rebornix/emulate ../emulate
cd ../emulate && pnpm install && pnpm build && cd -
npm run test:docs
```

CI does the same thing in `.github/workflows/ci.yml`.

### Editing the emulator

Iterate in your `../emulate` clone (the `lean-extensions` branch). When
you push your changes to `rebornix/emulate@lean-extensions`, both
local and CI runs of `lean`'s doc-tests pick them up immediately —
nothing about lean needs to change.

If you also want to backport changes onto the upstream
`vercel-labs/emulate` `feat/linear-emulator` branch (PR #91), do that
in the same clone with a separate remote.

### Updating from upstream

```bash
cd ../emulate
git remote add upstream https://github.com/vercel-labs/emulate.git
git fetch upstream main
git checkout lean-extensions
git rebase upstream/main
pnpm -F @emulators/linear test
git push origin lean-extensions
```

## Cursor Cloud specific instructions

The startup update script runs `npm ci` (which also builds `lean` via the
`prepare` hook) and ensures the Linear emulator is cloned and built.

- **Emulator lives at `$HOME/emulate`, not `../emulate`.** The repo root is
  `/workspace`, so the doc-test default of `../emulate` resolves to `/emulate`,
  which is not writable in this sandbox. The emulator is cloned to
  `$HOME/emulate` and the doc-test runner is pointed at it via the
  `LEAN_EMULATOR_DIR` environment variable.
- **Run doc-tests with the env var set explicitly**, since non-login shells do
  not inherit it:

  ```bash
  LEAN_EMULATOR_DIR="$HOME/emulate" npm run test:docs
  # or the full pre-flight:
  LEAN_EMULATOR_DIR="$HOME/emulate" npm run check
  ```

  `LEAN_EMULATOR_DIR` is also exported from `~/.bashrc`, so login/interactive
  shells (including tmux terminals) already have it.
- **Lint, format, and type-check need no emulator or env var**:
  `npm run lint`, `npm run format:check`, `npm run type-check`.
- **Running the CLI manually against a live emulator.** Start the emulator,
  reset+seed it, then point `lean` at it:

  ```bash
  # start (long-running; use a tmux terminal)
  LEAN_EMULATOR_STRICT=1 node "$HOME/emulate/packages/emulate/dist/index.js" \
    start --service linear --port 4200
  # seed with the doc-test fixtures (see Docs/_seed.yaml) via POST /__reset then /__seed
  # then run the CLI:
  export LINEAR_API_KEY=lin_api_test LINEAR_API_URL=http://localhost:4200/graphql LEAN_SKIP_DOTENV=1
  node dist/index.js issue list --all --format text
  ```

  Use `--format text` to force human-readable tables when stdout is not a TTY;
  otherwise `lean` emits JSON.
- The emulator build is captured in the VM snapshot. If it ever goes missing,
  re-run the update script (it re-clones/rebuilds idempotently) or follow the
  "First-time setup" steps above but clone to `$HOME/emulate`.
