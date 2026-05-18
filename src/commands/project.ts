import type { Command } from "commander";
import { getClient } from "../api/client.js";
import { findTeamByKey, listProjects, projectPayload } from "../api/projects.js";
import { LeanError } from "../errors.js";
import { table, respond } from "../output/index.js";

function parseLimit(value: string): number {
  const limit = Number(value);
  if (!Number.isInteger(limit) || limit < 0) {
    throw new LeanError("invalid_argument", `Invalid --limit: ${value}`, {
      action: "Use a non-negative integer.",
    });
  }
  return limit;
}

export function registerProjectCommands(project: Command): void {
  project
    .command("list")
    .description("List Linear projects")
    .option("--team <team>", "Filter by team key")
    .option("--state <state>", "Filter by project state")
    .option("--limit <n>", "Max results", "25")
    .option("--json", "Output as JSON")
    .option("--format <format>", "Output format: json or text")
    .action(async opts => {
      const client = getClient();
      const limit = parseLimit(opts.limit);
      const team = opts.team ? await findTeamByKey(client, opts.team) : undefined;
      const projects = await listProjects(client, { team, limit, state: opts.state });
      const payload = projects.map(projectPayload);

      respond(opts, payload, () => {
        if (projects.length === 0) {
          console.log("No projects match.");
          return;
        }

        table(
          projects.map(item => ({
            ID: item.id,
            Name: item.name,
            State: item.state,
            Team: item.team?.key ?? "—",
          }))
        );
      });
    });
}
