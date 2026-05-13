# Spec: Initial Implementation — Auth + Issue Commands

## Goal

Provide a working CLI that can authenticate with Linear and perform basic issue operations (list, create, view, edit, close, comment).

## UX

### Auth

```bash
lean auth login          # Prompt for API key, store in ~/.config/lean/config.json
lean auth status         # Show workspace + user name
lean auth logout         # Remove stored credentials
```

`LINEAR_API_KEY` env var overrides stored config.

### Issue List

```bash
lean issue list                              # My assigned issues (default)
lean issue list --all                        # All issues (team scope)
lean issue list --team ENG                   # Filter by team
lean issue list --state "In Progress"        # Filter by state name
lean issue list --priority urgent            # Filter by priority
lean issue list --assignee @me              # Explicit self
lean issue list --limit 50                   # Pagination
lean issue list --json id,title,state        # JSON output
```

Default table output:
```
ID        TITLE                    STATUS        ASSIGNEE    PRIORITY
ENG-123   Fix login bug            In Progress   Peng Lyu    High
ENG-124   Add dark mode            Todo          —           Medium
```

### Issue Create

```bash
lean issue create                            # Interactive: prompts for everything
lean issue create --title "Fix bug" --team ENG --priority high  # Partial → prompts for rest
```

Interactive flow:
1. Select team (TUI picker if multiple teams)
2. Enter title (plain prompt)
3. Enter description (open $EDITOR or skip)
4. Select priority (numbered list — only 5 options)
5. Select state (TUI picker)
6. Select assignee (TUI picker, optional)
7. Select labels (TUI multi-select, optional)

### Issue View

```bash
lean issue view ENG-123                      # Formatted display
lean issue view ENG-123 --json               # Full JSON
lean issue view ENG-123 --web                # Open in browser
```

### Issue Edit

```bash
lean issue edit ENG-123                      # Interactive
lean issue edit ENG-123 --state "Done"       # Direct
lean issue edit ENG-123 --priority urgent --assignee "user@email.com"
```

### Issue Close / Comment

```bash
lean issue close ENG-123                     # Move to completed state
lean issue comment ENG-123 --body "Fixed in PR #42"
lean issue comment ENG-123                   # Opens $EDITOR
```

## Technical Approach

1. **Entry point** (`src/index.ts`): Commander program with `auth` and `issue` subcommand groups
2. **API client** (`src/api/client.ts`): Initialize `@linear/sdk` with stored/env API key
3. **Config** (`src/config/index.ts`): Read/write `~/.config/lean/config.json`
4. **Output** (`src/output/`): Table formatter (auto-truncate to terminal width) + JSON mode
5. **Prompts** (`src/prompts/`): Reusable TUI pickers (team, state, assignee, labels, priority)
6. **Commands** (`src/commands/auth.ts`, `src/commands/issue.ts`)

## Edge Cases

- No API key set → helpful error: "Run `lean auth login` first"
- Invalid API key → catch 401, show clear message
- Team has custom workflow states → query dynamically, never hardcode
- Very long issue titles → truncate in table, show full in `view`
- Network errors → retry once, then show error with suggestion

## Acceptance Criteria

- [ ] `lean auth login` stores API key, `lean auth status` shows user info
- [ ] `lean issue list` shows formatted table of assigned issues
- [ ] `lean issue create` works both fully interactive and fully via flags
- [ ] `lean issue view ENG-123` displays issue details
- [ ] `lean issue edit ENG-123 --state "Done"` updates status
- [ ] `lean issue close ENG-123` moves to completed
- [ ] `lean issue comment ENG-123 --body "text"` adds comment
- [ ] All commands support `--json` for machine output
- [ ] Non-TTY mode errors clearly when required flags missing
