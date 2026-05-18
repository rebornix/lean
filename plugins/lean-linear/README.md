# Lean Linear Codex Plugin

This plugin packages the `lean` agent workflow for Codex. It is intentionally
skill-only: the CLI remains the integration boundary, and MCP can be added later
when a workflow needs tool-call wrapping.

The plugin does not bundle or install the `lean` binary. Agents are instructed to
use an existing `lean` command when present, build the CLI from a local
`rebornix/lean` checkout when that is the current workspace, or ask for an
installation source when neither is available.

## Local install

From the repository root:

```bash
codex plugin marketplace add .
```

Restart Codex, open `/plugins`, choose the **Lean Plugins** marketplace, and
install **Lean Linear**.

## Contents

- `.codex-plugin/plugin.json` defines the plugin metadata.
- `skills/lean-linear/SKILL.md` tells Codex how to use the `lean` CLI safely.

The repo-local marketplace entry lives at `.agents/plugins/marketplace.json`.
