# lean

A small TypeScript CLI for [Linear](https://linear.app). Human-friendly
in a TTY, machine-friendly everywhere else.

> **This is an unaffiliated third-party project.** Linear is a trademark
> of Linear. This project is not endorsed by or affiliated with Linear,
> and uses no Linear logos, wordmarks, or other brand assets. See
> [Linear's brand guidelines](https://linear.app/brand).

### Install

`lean` is distributed as a scoped npm package and can also be run
directly from this repository.

```bash
# from the published package (once released)
npm install -g @rebornix/lean

# or directly from GitHub (no publish needed; works on private repos too)
npx github:rebornix/lean issue list
```

### Quickstart

Get an API key at <https://linear.app/settings/api>, then:

```bash
export LINEAR_API_KEY=lin_api_...

lean auth status
lean team list
lean team view ENG --states --projects
lean issue list                      # defaults to your assigned issues
lean issue list --all                # the full board
lean issue search "Login" --team ENG --assignee anyone
lean issue view ENG-1
lean issue children ENG-1
lean project list --team ENG
lean issue create --team ENG --project Launch --priority High --title "Fix the bug"
lean issue edit ENG-1 --state Done --due-date 2026-05-29
lean issue bulk-create --file issues.json --json
lean issue close ENG-1
lean issue comment ENG-1 --body "Fixed in PR #42"

lean api --query '{ viewer { id name } }'   # raw GraphQL escape hatch
```

`lean usage` and `lean <cmd> usage` print token-budgeted help intended
for LLM agents. `--help` prints commander's full tree.

### Two modes

| Mode | When | Behaviour |
|---|---|---|
| **Human** | TTY stdout, no `--json` | Tables, labelled fields, plain `Error:` lines |
| **Agent** | Non-TTY stdout (pipe / CI / agent) or `--json` | JSON on stdout for success, JSON on stderr for errors |

Pass `--format text` to force human-readable success output when stdout is not
a TTY.

Errors carry a stable schema:
`{ "error": <id>, "message": ..., "action"?: ..., "exit_code": <n> }`
with exit codes `0` success, `1` user error, `2` auth, `3` network,
`4` internal.

See `SKILL.md` for an LLM-oriented one-pager and `Docs/errors.md` for
the full error catalog.

### Development

```bash
npm install
npm run build
npm run check                  # full pre-flight; runs lint, format, type, doc-tests
```

`lean` is verified by **executable doc-tests**: every fenced
` ```console ` block in `Docs/*.md` is parsed and run by
`scripts/doc-test.ts`. Each `$ <command>` line is executed; the lines
after it (until the next `$` or end of block) are the expected output.

```bash
npm run test:docs              # run all doc-tests
npm run test:docs -- --update  # rewrite expected blocks in place
```

The runner spawns a local Linear emulator (a fork of
[`vercel-labs/emulate`](https://github.com/vercel-labs/emulate) with
mutations, admin endpoints, and real filter support) and resets its
state between blocks so tests are independent. Set up the emulator
once:

```bash
git clone --branch lean-extensions https://github.com/rebornix/emulate ../emulate
cd ../emulate && pnpm install && pnpm build && cd -
npm run test:docs
```

The doc-tests double as the user docs in `Docs/` — what you read there
is exactly what `lean` produces. CI runs `npm run check` on every push
against the same emulator branch.

### Where the design lives

| File | What |
|---|---|
| `Specs/` | Spec for each major feature |
| `Decisions.md` | Architectural Decision Log; append-only |
| `AGENTS.md` | Authoritative dev guide intended for AI agents and humans |
| `SKILL.md` | Single-file LLM agent reference (under 8000 chars) |
| `Docs/` | Executable user docs / doc-tests |

### License

MIT. See [LICENSE](./LICENSE).
