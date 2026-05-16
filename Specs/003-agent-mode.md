# Spec: Agent Mode + Structured Errors

## Goal

Make `lean` a first-class citizen for agents and scripts by:

1. **Auto-detecting** human vs agent mode from TTY and `--json`.
2. Emitting **structured JSON errors** on stderr with a stable shape.
3. Using **stable exit codes** that distinguish kinds of failures.
4. Refusing to prompt in non-TTY mode; failing fast with a clear message.

Once this lands, every consumer (CI scripts, LLM agents, doc-tests) can
parse errors, branch on exit code, and trust that no command will ever
silently hang waiting for input.

## UX

### Mode detection

```
human mode  := process.stdout.isTTY && !flags.json
agent mode  := !process.stdout.isTTY || flags.json
```

`--json` always implies agent mode, even in a TTY.

`NO_COLOR=1` and `FORCE_COLOR=0` continue to suppress color (already true).
Agent mode adds: no spinners, no progress, no prompts.

### Structured error shape

All errors in agent mode go to **stderr** as a single JSON object:

```json
{
  "error": "missing_required_flag",
  "message": "--team is required when stdin is not a TTY",
  "action": "Pass --team <key>, e.g. --team ENG",
  "exit_code": 1
}
```

Field contract:

| Field        | Type    | Required | Notes                                                   |
|--------------|---------|----------|---------------------------------------------------------|
| `error`      | string  | yes      | Stable machine identifier in `snake_case`.              |
| `message`    | string  | yes      | Human-readable, one line.                               |
| `action`     | string  | no       | What the user/agent should do next, when knowable.      |
| `exit_code`  | number  | yes      | Mirrors `process.exitCode`.                             |
| `details`    | object  | no       | Extra context (request id, GraphQL path, etc.).         |

In **human mode**, errors print as plain coloured text, e.g.

```
Error: --team is required when stdin is not a TTY
Hint:  Pass --team <key>, e.g. --team ENG
```

### Exit codes

| Code | Name          | When                                                    |
|------|---------------|---------------------------------------------------------|
| 0    | `success`     | Operation completed.                                    |
| 1    | `user_error`  | Bad input, missing flag, not-found, validation failure. |
| 2    | `auth_error`  | Missing/invalid API key, 401/403 from Linear.           |
| 3    | `network_error` | Connection refused, DNS failure, timeout, 5xx.        |
| 4    | `internal_error` | Unhandled exception inside lean.                     |

### Stable error identifiers (initial set)

| `error` value                | exit | When                                                   |
|------------------------------|------|--------------------------------------------------------|
| `missing_required_flag`      | 1    | Required flag absent in non-TTY mode.                  |
| `not_found`                  | 1    | Entity (issue, team, state, user) not found.           |
| `invalid_argument`           | 1    | Malformed value (e.g. priority not 0..4).              |
| `prompt_required_in_non_tty` | 1    | A code path that needs interactive input is reached.   |
| `auth_required`              | 2    | No API key configured.                                 |
| `auth_invalid`               | 2    | Linear returned 401 / authentication error.            |
| `network`                    | 3    | Fetch threw / connection failure.                      |
| `linear_api`                 | 1    | Generic GraphQL error from Linear (with `details`).    |
| `internal`                   | 4    | Caught at top-level; should never happen.              |

### Examples

#### Missing required flag (agent mode, piped stdin)

```console
$ lean issue create --json
{
  "error": "missing_required_flag",
  "message": "--team is required when stdin is not a TTY",
  "action": "Pass --team <key>, e.g. --team ENG",
  "exit_code": 1
}
```

#### Not found

```console
$ lean issue view ENG-999
{
  "error": "not_found",
  "message": "Issue not found: ENG-999",
  "exit_code": 1
}
```

#### Auth missing

```console
$ unset LINEAR_API_KEY; lean auth status
{
  "error": "auth_required",
  "message": "No API key configured",
  "action": "Run `lean auth login` or set LINEAR_API_KEY",
  "exit_code": 2
}
```

#### Auth invalid

```console
$ LINEAR_API_KEY=bogus lean issue list
{
  "error": "auth_invalid",
  "message": "Authentication failed",
  "action": "Check your API key with `lean auth status`",
  "exit_code": 2
}
```

#### Network failure

```console
$ LINEAR_API_URL=http://localhost:1 lean issue list
{
  "error": "network",
  "message": "Could not reach Linear API at http://localhost:1",
  "exit_code": 3
}
```

## Technical Approach

### New module: `src/errors.ts`

```ts
export type LeanErrorCode =
  | "missing_required_flag"
  | "not_found"
  | "invalid_argument"
  | "prompt_required_in_non_tty"
  | "auth_required"
  | "auth_invalid"
  | "network"
  | "linear_api"
  | "internal";

export class LeanError extends Error {
  readonly code: LeanErrorCode;
  readonly action?: string;
  readonly details?: Record<string, unknown>;
  readonly exitCode: number;
  constructor(code: LeanErrorCode, message: string, opts?: {
    action?: string; details?: Record<string, unknown>; exitCode?: number;
  });
}
```

Exit-code mapping is centralized in `errors.ts`.

### New module: `src/output/mode.ts`

```ts
export interface OutputMode {
  agent: boolean;          // !process.stdout.isTTY || jsonFlag
  json: boolean;           // explicit --json
  color: boolean;          // !NO_COLOR && stdout.isTTY
}
export function detectMode(opts: { json?: boolean }): OutputMode;
```

### Top-level error handler in `src/index.ts`

Wrap `program.parseAsync` in a try/catch:

```ts
try {
  await program.parseAsync(argv);
} catch (err) {
  reportError(err);          // formats per mode, sets exit code, exits.
}
```

`reportError` recognises `LeanError`, GraphQL-shaped errors from
`@linear/sdk` (mapped to `auth_invalid` / `linear_api`), and `fetch`-style
network errors (mapped to `network`). Anything else → `internal` (exit 4).

### Refactor every `console.error(...); process.exit(1)` site

Throw `LeanError` instead. Examples:

```ts
// Before
if (!opts.team) { console.error("--team required"); process.exit(1); }

// After
if (!opts.team) {
  throw new LeanError("missing_required_flag",
    "--team is required when stdin is not a TTY",
    { action: "Pass --team <key>, e.g. --team ENG" });
}
```

### Prompts gated behind TTY check

`auth login` currently calls `@inquirer/prompts.input()` unconditionally;
in non-TTY that hangs (or throws). Wrap each prompt call site:

```ts
if (!process.stdin.isTTY) {
  throw new LeanError("prompt_required_in_non_tty",
    "Cannot prompt for API key in non-interactive mode",
    { action: "Set LINEAR_API_KEY or rerun in a terminal" });
}
const apiKey = await input({ message: "..." });
```

### `--json` flag mechanics

Already declared per-command. We will:
- Read it via `cmd.opts().json`.
- Plumb it into `detectMode()` so error formatting matches.
- Standardise: every command's success path must respect agent vs human
  mode. Existing JSON shapes stay; we just guarantee no human-mode
  artifacts (colour, "Hint:" lines) leak when `--json` is set.

### Where exit codes get set

`reportError` is the single place that sets `process.exitCode`. No more
scattered `process.exit(1)` calls. After printing, `process.exit(code)` to
flush stdout/stderr and exit cleanly.

## Edge Cases

- **--json with success output**: ensure trailing newline, no color codes.
- **Mixed stderr/stdout in tests**: the doc-test runner concatenates them.
  Keep human messages on stderr only when they're errors; success goes to
  stdout. Rule: success → stdout; errors → stderr.
- **GraphQL "not found"**: emulator returns `data.issue: null`. Lean
  must distinguish "lookup returned null" (→ `not_found`, exit 1) from
  "GraphQL request failed" (→ `linear_api`, exit 1). Done at the lookup
  helper layer.
- **Network error vs auth error**: both manifest as fetch failures. Treat
  401/403 in response → `auth_invalid` (exit 2). Anything that prevents
  reaching the server → `network` (exit 3).
- **--web in non-TTY**: still allowed (it spawns a process). No prompt
  required, so no special handling.
- **NO_COLOR + TTY**: human mode, no color. (Today's behavior.)

## Acceptance Criteria

- [ ] All scattered `console.error / process.exit(1)` sites replaced with
      `throw new LeanError(...)`.
- [ ] Top-level handler in `src/index.ts` formats errors per mode and sets
      the exit code.
- [ ] Doc-tests in `Docs/errors.md` cover at least:
      missing flag, not found, auth required, auth invalid, network.
- [ ] Auth `login` errors with `prompt_required_in_non_tty` when stdin is
      piped (exercise via doc-test).
- [ ] `npm run test:docs` still passes 100%.
- [ ] Existing 27 doc-tests continue to pass (no regressions in success
      paths).
- [ ] `Decisions.md` gets an ADR for the error shape and exit codes.
EOF
