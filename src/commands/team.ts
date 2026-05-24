import type { Command } from "commander";
import { getClient } from "../api/client.js";
import { parseLimit } from "../api/issues.js";
import { findTeam, listTeamStates, listTeams, teamPayload } from "../api/teams.js";
import { listProjects, projectPayload } from "../api/projects.js";
import { respond, table } from "../output/index.js";

export function registerTeamCommands(team: Command): void {
  team
    .command("list")
    .description("List Linear teams")
    .option("--limit <n>", "Max results", "100")
    .option("--json", "Output as JSON")
    .option("--format <format>", "Output format: json or text")
    .action(async opts => {
      const client = getClient();
      const limit = parseLimit(opts.limit);
      const teams = await listTeams(client, limit);
      const payload = teams.map(teamPayload);

      respond(opts, payload, () => {
        if (teams.length === 0) {
          console.log("No teams match.");
          return;
        }
        table(
          teams.map(item => ({
            ID: item.id,
            Key: item.key,
            Name: item.name,
          }))
        );
      });
    });

  team
    .command("view <team>")
    .description("View a Linear team")
    .option("--states", "Include workflow states")
    .option("--projects", "Include projects")
    .option("--json", "Output as JSON")
    .option("--format <format>", "Output format: json or text")
    .action(async (teamRef: string, opts) => {
      const client = getClient();
      const item = await findTeam(client, teamRef);
      const states = opts.states ? await listTeamStates(client, item.id) : undefined;
      const projects = opts.projects ? await listProjects(client, { team: item }) : undefined;
      const payload = {
        ...teamPayload(item),
        ...(states ? { states } : {}),
        ...(projects ? { projects: projects.map(projectPayload) } : {}),
      };

      respond(opts, payload, () => {
        console.log(`${item.key}: ${item.name}`);
        console.log(`ID: ${item.id}`);
        if (states) {
          console.log("");
          table(
            states.map(state => ({
              ID: state.id,
              Name: state.name,
              Type: state.type,
              Position: String(state.position),
            }))
          );
        }
        if (projects) {
          console.log("");
          table(
            projects.map(project => ({
              ID: project.id,
              Name: project.name,
              State: project.state,
            }))
          );
        }
      });
    });
}
