# Spec: Agent-First Design

## Goal

`lean` must work seamlessly for all types of agents (LLM agents, CI scripts, automation) while being pleasant for human interactive use.

## Patterns we adopt

Agent-friendly CLI patterns that have proven their worth elsewhere:

- **JSON output everywhere** — every command supports `--json` for clean machine-parseable output, with the human-friendly table being the TTY default.
- **Two-tier discovery** — a token-budgeted `lean usage` and `lean <cmd> usage` for agents, distinct from commander's full `--help` tree, so agents don't have to load hundreds of tokens just to learn what's available.
- **Structured JSON errors** — `{ error, message, action?, exit_code, details? }` so agents can branch on the failure cause instead of grep-ing prose.
- **Universal ID resolution** — accept a UUID, a `TEAM-N` identifier, or a name/email at the boundary; resolve to internal IDs before sending GraphQL.
- **A raw GraphQL escape hatch** (`lean api`) with `--variable` and `--paginate`, so anything not yet exposed as a first-class command is still reachable.
- **File-based input** for agent-generated content (`--description-file`, `--body-file`).
- **A single-file `SKILL.md`** that an LLM can load as a self-contained reference.

## Design: Dual-Mode Output

### Human Mode (default in TTY)
- Colored table output, auto-truncated to terminal width
- Interactive prompts for missing required args (team picker, state picker, etc.)
- Progress spinners for slow operations
- Friendly error messages

### Agent Mode (non-TTY, or `--json` flag)
- Structured JSON output on stdout
- Structured JSON errors on stderr
- No prompts — missing required args = error with actionable message
- No color, no spinners, no progress indicators
- Exit codes: 0 = success, 1 = user error, 2 = auth error, 3 = network error

### Auto-Detection

```
if (--json flag || !process.stdout.isTTY) → agent mode
else → human mode
```

## Token-Efficient Discovery

Like linearis, support two-tier usage:

```console
$ lean usage
lean - CLI for Linear project management

Commands:
  auth     Authentication (login, status, logout)
  issue    Issues (list, create, view, edit, close, comment)
  config   Configuration

Use `lean <command> usage` for details.
```

```console
$ lean issue usage
lean issue - Issue management

  list    List issues (--team, --state, --assignee, --priority, --limit)
  create  Create issue (--title, --team, --description, --priority, --state, --assignee, --label)
  view    View issue details (--web)
  edit    Update issue fields (--title, --state, --assignee, --priority, --label)
  close   Move issue to completed state
  comment Add comment (--body, --body-file)

All commands support --json for structured output.
```

This gives agents ~100–200 tokens of context instead of a full man page.

## Universal ID Resolution

Accept any identifier format and resolve at the boundary:

| Input | Resolves via |
|-------|-------------|
| `ENG-123` | Parse team key + number |
| `issue-uuid-here` | Direct UUID lookup |
| `"In Progress"` | State name → UUID |
| `ENG` | Team key → UUID |
| `@me` | Current user → UUID |
| `user@email.com` | User email → UUID |

## File-Based Input

For agents generating multiline content:

```bash
lean issue create --title "Bug" --description-file /tmp/desc.md
lean issue comment ENG-123 --body-file /tmp/comment.md
```

## Structured Errors

```json
{
  "error": "auth_required",
  "message": "No API key configured",
  "action": "Run `lean auth login` or set LINEAR_API_KEY",
  "exit_code": 2
}
```

## Raw API Escape Hatch

For operations the CLI doesn't cover:

```bash
lean api --query '{ viewer { id name } }'
lean api --query-file query.graphql --variable teamId=TEAM_UUID
lean api --query '{ issues(first: 100) { nodes { id title } } }' --paginate
```

## Agent Skill File

Ship a `SKILL.md` (or `lean usage --full`) that agents can load for comprehensive command reference. Keep it under 2000 tokens.
