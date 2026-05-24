---
name: lean-linear
description: Use the lean CLI to read, create, and update Linear issues from Codex.
---

# Lean Linear

Use `lean` as the default interface for Linear work in this repository. Do not call the Linear API directly unless the user explicitly asks for a raw API investigation or `lean api` is not enough.

## CLI Acquisition

This plugin does not bundle a `lean` binary. Before using Linear workflows, find or bootstrap the CLI:

1. Check for an installed CLI:

```bash
command -v lean
```

2. If `lean` is not installed but the current workspace is the `rebornix/lean` checkout, build the local CLI and use `node dist/index.js` as the command:

```bash
npm install
npm run build
node dist/index.js usage
```

3. If neither is available, tell the user the plugin supplies agent workflow instructions but the `lean` CLI is not available in the current environment. Ask for a checkout path or installation source instead of guessing an npm package or cloning without direction.

When examples below use `lean`, substitute `node dist/index.js` in a local checkout if there is no global `lean` command.

## Setup

Run commands from the repository root after dependencies are installed and the CLI is built:

```bash
npm install
npm run build
```

Authentication is provided by `LINEAR_API_KEY` or by `lean auth login --api-key <key>`. Never print or persist secrets outside the existing `lean` auth path.

## Discovery

Prefer the token-budgeted usage commands before falling back to full help:

```bash
lean usage
lean issue usage
lean team usage
lean auth usage
lean --help
```

## Output Contract

When stdout is not a TTY, `lean` emits JSON success payloads by default. Errors in agent mode are JSON on stderr with stable `error`, `message`, and `exit_code` fields. Do not assume a command succeeded because it printed human-readable text.

Use these output controls intentionally:

```bash
lean issue list --json
lean issue list --format text
lean auth status --json
```

Use `--format text` only when the human-shaped output is the requested artifact. For automation, parsing, or follow-up decisions, use the JSON default or `--json`.

## Common Workflows

List assigned work:

```bash
lean issue list --assignee @me --limit 20
```

List projects before creating project-scoped issues:

```bash
lean team view ENG --states --projects --json
lean project list --team ENG
```

Search for duplicates before creating a new issue:

```bash
lean issue search "sync failure" --team ENG --assignee anyone --json
```

Inspect an issue:

```bash
lean issue view ENG-1
lean issue children ENG-1 --json
lean issue tree ENG-1 --json
```

Create an issue with explicit required fields:

```bash
lean issue create --team ENG --project Research --priority High --due-date 2026-05-29 --title "Fix issue sync failure" --description-file /tmp/issue-body.md
```

Update an issue:

```bash
lean issue edit ENG-1 --state "In Progress" --parent ENG-2 --sub-issue-sort-order 1000
lean issue comment ENG-1 --body-file /tmp/comment.md
lean issue close ENG-1
```

Bulk create or edit from JSON:

```bash
lean issue bulk-create --file /tmp/issues.json --json
lean issue bulk-edit --file /tmp/updates.json --json
```

Use the GraphQL escape hatch when the CLI does not expose a needed operation:

```bash
lean api --query '{ viewer { id name email } }'
```

## Agent Behavior

- Prefer issue identifiers like `ENG-1` or UUIDs over fuzzy titles once known.
- Treat `auth_required` as setup state and explain the needed auth command.
- Preview destructive or externally visible writes unless the user asked for the exact mutation.
- Put long descriptions and comments in a temporary file and pass `--description-file` or `--body-file`.
- For project-scoped work, inspect `lean project list --team <key>` and pass `--project <id-or-name>` to `lean issue create`.
- Use `lean team view <key> --states --projects --json` for state/project discovery and `lean issue search` before creating possible duplicates.
- Use first-class `--parent`, `--due-date`, `--sub-issue-sort-order`, `bulk-create`, and `bulk-edit` commands before dropping to raw GraphQL.
- Keep command output parsing JSON-based for non-TTY execution.
- If a `lean` command lacks the needed operation, use `lean api` before reaching for another Linear client.
