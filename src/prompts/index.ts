import { select, checkbox } from "@inquirer/prompts";
import { getClient } from "../api/client.js";

export async function teamPicker(): Promise<string> {
  const client = getClient();
  const teams = await client.teams();
  return select({
    message: "Select team:",
    choices: teams.nodes.map(t => ({ name: `${t.key} - ${t.name}`, value: t.id })),
  });
}

export async function statePicker(teamId: string): Promise<string> {
  const client = getClient();
  const team = await client.team(teamId);
  const states = await team.states();
  return select({
    message: "Select state:",
    choices: states.nodes.map(s => ({ name: s.name, value: s.id })),
  });
}

export async function assigneePicker(): Promise<string> {
  const client = getClient();
  const users = await client.users();
  return select({
    message: "Select assignee:",
    choices: users.nodes.map(u => ({ name: u.name, value: u.id })),
  });
}

export async function labelPicker(): Promise<string[]> {
  const client = getClient();
  const labels = await client.issueLabels();
  return checkbox({
    message: "Select labels:",
    choices: labels.nodes.map(l => ({ name: l.name, value: l.id })),
  });
}

export async function priorityPicker(): Promise<number> {
  const val = await select({
    message: "Select priority:",
    choices: [
      { name: "No priority", value: 0 },
      { name: "Urgent", value: 1 },
      { name: "High", value: 2 },
      { name: "Medium", value: 3 },
      { name: "Low", value: 4 },
    ],
  });
  return val;
}
