import type { Command } from "commander";
import { LeanError } from "../errors.js";

const ROOT_USAGE = `lean - CLI for Linear project management

Commands:
  auth     Authentication (login, status, logout)
  issue    Issues (list, search, view, create, edit, children, tree, bulk)
  project  Projects (list)
  team     Teams (list, view)
  api      Send a raw GraphQL request to Linear
  usage    Show this help, or \`lean <cmd> usage\` for command details

Data commands emit JSON in non-TTY mode or with --json. Use --format text to
force text output. Errors are JSON on stderr in non-TTY / --json
mode. Exit codes: 0 success, 1 user error, 2 auth, 3 network, 4 internal.

Use \`lean <command> usage\` for details, or \`lean --help\` for full help.`;

const AUTH_USAGE = `lean auth - Authentication

  login   Save a Linear API key (--api-key for headless, --json, --format text)
  status  Show the currently authenticated user (--json, --format text)
  logout  Remove stored credentials (--json, --format text)

Env: LINEAR_API_KEY overrides ~/.config/lean/config.json.`;

const ISSUE_USAGE = `lean issue - Issue management

  list    List issues (--team, --state, --assignee, --priority, --limit,
          --json, --format text)
  search  Search issues (--team, --state, --assignee, --priority, --limit,
          --json, --format text)
  view    Show one issue (--json, --format text, --web)
  children List child issues (--limit, --state, --json, --format text)
  tree    Show one issue plus one level of children (--limit, --state, --json)
  create  Create an issue (--team, --title, --description, --description-file,
          --priority, --state, --assignee, --project, --parent, --due-date,
          --sub-issue-sort-order, --json, --format text)
  edit    Update an issue (--title, --description, --description-file, --state,
          --assignee, --priority, --project/--no-project, --parent/--no-parent,
          --due-date, --sub-issue-sort-order, --json, --format text)
  bulk-create Create issues from JSON (--file, --continue-on-error, --json)
  bulk-edit   Update issues from JSON (--file, --continue-on-error, --json)
  close   Move an issue to its team's first completed state (--json, --format text)
  comment Add a comment (--body, --body-file, --json, --format text)

Identifiers: ENG-1 (team key + number) or a UUID.

Non-TTY output defaults to JSON; pass --format text for tables/messages.
See Docs/issue-*.md for examples.`;

const PROJECT_USAGE = `lean project - Project discovery

  list    List projects (--team, --state, --limit, --json, --format text)

Use \`lean project list --team ENG\` before \`lean issue create --project <name>\`
when an issue should be assigned to a Linear project. Project references accept
an id, exact name, slugId, or unique partial name.`;

const TEAM_USAGE = `lean team - Team discovery

  list    List teams (--limit, --json, --format text)
  view    Show one team (--states, --projects, --json, --format text)

Use \`lean team view ENG --states --projects --json\` before creating or
moving issues when you need team, state, and project IDs.`;

const API_USAGE = `lean api - Send a raw GraphQL request to Linear

Flags:
  --query <gql>         Inline GraphQL document (one of --query / --query-file)
  --query-file <path>   Read query from file
  --variable <key=val>  Variable; repeatable. Value is JSON if it starts with
                        { [ " digit / -, or true/false/null. Otherwise string.
  --operation <name>    Pick an operation when the document defines several.
  --paginate            Walk pageInfo.endCursor; merge nodes (cap 50 pages).

Output is always JSON: { "data": ... }. Linear errors raise exit 1 with
the GraphQL errors in the payload. Network = exit 3. Auth = exit 2.`;

export function usageText(topic?: string): string {
  switch (topic) {
    case undefined:
    case "":
      return ROOT_USAGE;
    case "auth":
      return AUTH_USAGE;
    case "issue":
      return ISSUE_USAGE;
    case "project":
      return PROJECT_USAGE;
    case "team":
      return TEAM_USAGE;
    case "api":
      return API_USAGE;
    default:
      throw new LeanError("not_found", `Unknown usage topic: ${topic}`, {
        action: "Try `lean usage` for the list of topics",
      });
  }
}

export function registerUsageCommand(program: Command): void {
  program
    .command("usage")
    .description("Show token-efficient usage for lean or a subcommand")
    .argument("[topic]", "auth | issue | project | team | api")
    .action((topic?: string) => {
      console.log(usageText(topic));
    });
}

export function registerSubcommandUsage(parent: Command, topic: "auth" | "issue" | "project" | "team" | "api"): void {
  parent
    .command("usage")
    .description(`Show token-efficient usage for lean ${topic}`)
    .action(() => {
      console.log(usageText(topic));
    });
}
