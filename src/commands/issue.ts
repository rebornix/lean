import type { Command } from "commander";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { getClient } from "../api/client.js";
import { table, json } from "../output/index.js";
import { priorityLabel } from "../output/priority.js";
import { LeanError } from "../errors.js";

interface RawIssue {
  id: string;
  identifier: string;
  title: string;
  description: string | null;
  url: string;
  priority: number;
  team?: { id: string; key: string } | null;
  state?: { id: string; name: string } | null;
  assignee?: { id: string; name: string; email: string } | null;
}

const ISSUE_FIELDS = `
  id identifier title description url priority
  team { id key }
  state { id name }
  assignee { id name email }
`;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TEAM_NUMBER_RE = /^([A-Z][A-Z0-9_]*)-(\d+)$/;

async function lookupIssue(identifier: string): Promise<RawIssue | null> {
  const client = getClient();

  if (UUID_RE.test(identifier)) {
    const res = await client.client.rawRequest<{ issue: RawIssue | null }, { id: string }>(
      `query LookupIssueById($id: String!) { issue(id: $id) { ${ISSUE_FIELDS} } }`,
      { id: identifier }
    );
    return res.data?.issue ?? null;
  }

  const m = TEAM_NUMBER_RE.exec(identifier);
  if (m) {
    const teamKey = m[1]!;
    const number = Number(m[2]!);
    const res = await client.client.rawRequest<{ issues: { nodes: RawIssue[] } }, { filter: unknown }>(
      `query LookupIssueByKey($filter: IssueFilter!) {
         issues(filter: $filter, first: 1) { nodes { ${ISSUE_FIELDS} } }
       }`,
      {
        filter: {
          team: { key: { eq: teamKey } },
          number: { eq: number },
        },
      }
    );
    return res.data?.issues.nodes[0] ?? null;
  }

  return null;
}

async function findStateByName(
  client: ReturnType<typeof getClient>,
  teamId: string,
  stateName: string
): Promise<string | null> {
  const team = await client.team(teamId);
  const states = await team.states();
  const match = states.nodes.find(s => s.name.toLowerCase() === stateName.toLowerCase());
  return match?.id ?? null;
}

async function findFirstCompletedState(client: ReturnType<typeof getClient>, teamId: string): Promise<string | null> {
  const team = await client.team(teamId);
  const states = await team.states();
  const completed = states.nodes.filter(s => s.type === "completed").sort((a, b) => a.position - b.position);
  return completed[0]?.id ?? null;
}

async function openUrl(url: string): Promise<void> {
  const [command, args] =
    process.platform === "darwin"
      ? ["open", [url]]
      : process.platform === "win32"
        ? ["rundll32", ["url.dll,FileProtocolHandler", url]]
        : ["xdg-open", [url]];

  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { detached: true, stdio: "ignore" });
    child.once("error", reject);
    child.once("spawn", () => {
      child.unref();
      resolve();
    });
  });
}

export function registerIssueCommands(issue: Command): void {
  issue
    .command("list")
    .description("List issues (default: assigned to you)")
    .option("--team <team>", "Filter by team key")
    .option("--state <state>", "Filter by state name")
    .option("--assignee <assignee>", "Filter by assignee (@me, anyone, or email)")
    .option("--priority <priority>", "Filter by priority (1-4)")
    .option("--limit <n>", "Max results", "25")
    .option("--all", "List all issues; equivalent to --assignee anyone")
    .option("--json", "Output as JSON")
    .action(async opts => {
      const client = getClient();
      const filter: Record<string, unknown> = {};

      if (opts.team) {
        filter.team = { key: { eq: opts.team } };
      }
      if (opts.state) {
        filter.state = { name: { eq: opts.state } };
      }

      const wantAllAssignees = opts.all === true || opts.assignee === "anyone";
      if (!wantAllAssignees) {
        const assignee = opts.assignee ?? "@me";
        if (assignee === "@me") {
          filter.assignee = { isMe: { eq: true } };
        } else {
          filter.assignee = { email: { eq: assignee } };
        }
      }
      if (opts.priority) {
        filter.priority = { eq: parseInt(opts.priority) };
      }

      const limit = parseInt(opts.limit);
      const result = await client.client.rawRequest<
        { issues: { nodes: RawIssue[] } },
        { filter: unknown; first: number }
      >(
        `query Q($filter: IssueFilter, $first: Int!) {
           issues(filter: $filter, first: $first) { nodes { ${ISSUE_FIELDS} } }
         }`,
        { filter, first: limit }
      );
      const issues = result.data?.issues.nodes ?? [];

      if (opts.json) {
        json(
          issues.map(i => ({
            id: i.identifier,
            title: i.title,
            state: i.state?.name ?? null,
            priority: i.priority,
            priorityLabel: priorityLabel(i.priority),
            assignee: i.assignee?.email ?? null,
          }))
        );
        return;
      }

      if (issues.length === 0) {
        console.log("No issues match.");
        return;
      }

      const rows = issues.map(i => ({
        ID: i.identifier,
        Title: i.title.slice(0, 60),
        State: i.state?.name ?? "—",
        Priority: priorityLabel(i.priority),
        Assignee: i.assignee?.name ?? "—",
      }));
      table(rows);
    });

  issue
    .command("view <identifier>")
    .description("View an issue")
    .option("--json", "Output as JSON")
    .option("--web", "Open in browser")
    .action(async (identifier: string, opts) => {
      const iss = await lookupIssue(identifier);
      if (!iss) {
        throw new LeanError("not_found", `Issue not found: ${identifier}`);
      }
      if (opts.web) {
        await openUrl(iss.url);
        return;
      }
      const description = iss.description && iss.description.length > 0 ? iss.description : null;
      if (opts.json) {
        json({
          id: iss.identifier,
          title: iss.title,
          description,
          state: iss.state?.name ?? null,
          priority: iss.priority,
          priorityLabel: priorityLabel(iss.priority),
          assignee: iss.assignee?.email ?? null,
          url: iss.url,
        });
        return;
      }
      console.log(`${iss.identifier}: ${iss.title}`);
      console.log(`State:    ${iss.state?.name ?? "—"}`);
      console.log(`Priority: ${priorityLabel(iss.priority)}`);
      console.log(`Assignee: ${iss.assignee?.name ?? "—"}`);
      console.log(`URL:      ${iss.url}`);
      console.log("");
      console.log(description ?? "(no description)");
    });

  issue
    .command("create")
    .description("Create an issue")
    .option("--team <team>", "Team key (e.g. ENG)")
    .option("--title <title>", "Issue title")
    .option("--description <description>", "Issue description")
    .option("--description-file <file>", "Read description from file")
    .option("--priority <priority>", "Priority 0-4")
    .option("--state <state>", "Workflow state name")
    .option("--assignee <assignee>", "Assignee email or @me")
    .option("--json", "Output as JSON")
    .action(async opts => {
      if (!opts.team || !opts.title) {
        throw new LeanError("missing_required_flag", "--team and --title are required", {
          action: "Pass --team <key> and --title <text>",
        });
      }
      const client = getClient();
      const teams = await client.teams({ filter: { key: { eq: opts.team } } });
      const team = teams.nodes.find(t => t.key === opts.team) ?? null;
      if (!team) {
        throw new LeanError("not_found", `Team not found: ${opts.team}`);
      }
      const description = opts.descriptionFile ? await readFile(opts.descriptionFile, "utf-8") : opts.description;
      const stateId = opts.state ? await findStateByName(client, team.id, opts.state) : undefined;
      let assigneeId: string | undefined;
      if (opts.assignee) {
        if (opts.assignee === "@me") {
          const me = await client.viewer;
          assigneeId = me.id;
        } else {
          const users = await client.users({ filter: { email: { eq: opts.assignee } } });
          assigneeId = users.nodes.find(u => u.email === opts.assignee)?.id;
        }
      }
      const result = await client.client.rawRequest<
        { issueCreate: { issue: { identifier: string; title: string } | null } },
        Record<string, unknown>
      >(
        `mutation Create($input: IssueCreateInput!) {
           issueCreate(input: $input) { issue { identifier title } }
         }`,
        {
          input: {
            teamId: team.id,
            title: opts.title,
            description,
            priority: opts.priority ? parseInt(opts.priority) : undefined,
            stateId,
            assigneeId,
          },
        }
      );
      const created = result.data?.issueCreate.issue;
      if (!created) {
        throw new LeanError("linear_api", "issueCreate did not return an issue");
      }
      if (opts.json) {
        json({ id: created.identifier, title: created.title });
        return;
      }
      console.log(`${created.identifier}: ${created.title}`);
    });

  issue
    .command("edit <identifier>")
    .description("Edit an issue")
    .option("--title <title>", "New title")
    .option("--state <state>", "Workflow state name")
    .option("--priority <priority>", "Priority 0-4")
    .option("--assignee <assignee>", "Assignee email or @me")
    .option("--json", "Output as JSON")
    .action(async (identifier: string, opts) => {
      const client = getClient();
      const iss = await lookupIssue(identifier);
      if (!iss) {
        throw new LeanError("not_found", `Issue not found: ${identifier}`);
      }
      const update: Record<string, unknown> = {};
      if (opts.title) {
        update.title = opts.title;
      }
      if (opts.priority) {
        update.priority = parseInt(opts.priority);
      }
      if (opts.state && iss.team) {
        const stateId = await findStateByName(client, iss.team.id, opts.state);
        if (!stateId) {
          throw new LeanError("not_found", `State not found: ${opts.state}`);
        }
        update.stateId = stateId;
      }
      if (opts.assignee) {
        if (opts.assignee === "@me") {
          const me = await client.viewer;
          update.assigneeId = me.id;
        } else {
          const users = await client.users({ filter: { email: { eq: opts.assignee } } });
          const u = users.nodes.find(user => user.email === opts.assignee);
          if (!u) {
            throw new LeanError("not_found", `User not found: ${opts.assignee}`);
          }
          update.assigneeId = u.id;
        }
      }
      await client.client.rawRequest(
        `mutation Update($id: String!, $input: IssueUpdateInput!) {
           issueUpdate(id: $id, input: $input) { issue { identifier } }
         }`,
        { id: iss.id, input: update }
      );
      const refreshed = await lookupIssue(identifier);
      if (opts.json) {
        json({ id: refreshed?.identifier, title: refreshed?.title });
        return;
      }
      console.log(`${refreshed?.identifier}: ${refreshed?.title}`);
    });

  issue
    .command("close <identifier>")
    .description("Move an issue to its team's first completed state")
    .option("--json", "Output as JSON")
    .action(async (identifier: string, opts) => {
      const client = getClient();
      const iss = await lookupIssue(identifier);
      if (!iss) {
        throw new LeanError("not_found", `Issue not found: ${identifier}`);
      }
      if (!iss.team) {
        throw new LeanError("invalid_argument", "Issue has no team");
      }
      const stateId = await findFirstCompletedState(client, iss.team.id);
      if (!stateId) {
        throw new LeanError("not_found", `No completed workflow state found for team ${iss.team.key}`);
      }
      await client.client.rawRequest(
        `mutation Close($id: String!, $input: IssueUpdateInput!) {
           issueUpdate(id: $id, input: $input) { issue { identifier } }
         }`,
        { id: iss.id, input: { stateId } }
      );
      if (opts.json) {
        json({ id: iss.identifier, closed: true });
        return;
      }
      console.log(`Closed ${iss.identifier}`);
    });

  issue
    .command("comment <identifier>")
    .description("Add a comment to an issue")
    .option("--body <body>", "Comment body")
    .option("--body-file <file>", "Read comment body from file")
    .option("--json", "Output as JSON")
    .action(async (identifier: string, opts) => {
      const body = opts.bodyFile ? await readFile(opts.bodyFile, "utf-8") : opts.body;
      if (!body) {
        throw new LeanError("missing_required_flag", "--body or --body-file is required", {
          action: "Provide --body <text> or --body-file <path>",
        });
      }
      const client = getClient();
      const iss = await lookupIssue(identifier);
      if (!iss) {
        throw new LeanError("not_found", `Issue not found: ${identifier}`);
      }
      await client.client.rawRequest(
        `mutation Comment($input: CommentCreateInput!) {
           commentCreate(input: $input) { comment { id } }
         }`,
        { input: { issueId: iss.id, body } }
      );
      if (opts.json) {
        json({ issue: iss.identifier, body });
        return;
      }
      console.log(`Commented on ${iss.identifier}`);
    });
}
