import { readFile } from "node:fs/promises";
import { getClient } from "./client.js";
import { PROJECT_FIELDS, projectPayload, type LinearProjectSummary } from "./projects.js";
import { LeanError } from "../errors.js";
import { priorityLabel } from "../output/priority.js";

export interface LinearIssueSummary {
  id: string;
  identifier: string;
  title: string;
  description?: string | null;
  url: string;
  priority: number;
  dueDate?: string | null;
  subIssueSortOrder?: number | null;
  team?: { id: string; key: string } | null;
  state?: { id: string; name: string } | null;
  assignee?: { id: string; name: string; email: string } | null;
  parent?: { id: string; identifier: string; title: string } | null;
  project?: LinearProjectSummary | null;
}

export interface IssueJson {
  id: string;
  title: string;
  description?: string | null;
  state?: string | null;
  priority?: number;
  priorityLabel?: string;
  assignee?: string | null;
  parent?: string | null;
  project?: Record<string, string | null> | null;
  dueDate?: string | null;
  subIssueSortOrder?: number | null;
  url?: string;
  children?: IssueJson[];
}

export interface IssuePayloadOptions {
  includeDescription?: boolean;
  includeUrl?: boolean;
  includeParent?: boolean;
  includeProject?: boolean;
  includeDueDate?: boolean;
  includeSubIssueSortOrder?: boolean;
  children?: LinearIssueSummary[];
}

export const ISSUE_CORE_FIELDS = `
  id identifier title description url priority
  team { id key }
  state { id name }
  assignee { id name email }
  project { ${PROJECT_FIELDS} }
`;

export const ISSUE_EXTENDED_FIELDS = `
  ${ISSUE_CORE_FIELDS}
  dueDate
  subIssueSortOrder
  parent { id identifier title }
`;

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const TEAM_NUMBER_RE = /^([A-Z][A-Z0-9_]*)-(\d+)$/;

type LinearClient = ReturnType<typeof getClient>;
type RawResponse<T> = { data?: T; errors?: { message?: string }[] };

function trimValue(value: string, flag: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new LeanError("invalid_argument", `${flag} cannot be empty`);
  }
  return trimmed;
}

export function compactInput(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
}

export function rawGraphQlErrorMessage(response: { errors?: { message?: string }[] }): string | null {
  const messages = response.errors
    ?.map(error => error.message)
    .filter((message): message is string => Boolean(message));
  if (!messages || messages.length === 0) {
    return null;
  }
  return messages.join("\n");
}

export function throwRawGraphQlErrors(response: { errors?: { message?: string }[] }): void {
  const message = rawGraphQlErrorMessage(response);
  if (message) {
    throw new LeanError("linear_api", message);
  }
}

export function parseLimit(value: string, flag = "--limit"): number {
  const limit = Number(value);
  if (!Number.isInteger(limit) || limit < 0) {
    throw new LeanError("invalid_argument", `Invalid ${flag}: ${value}`, {
      action: "Use a non-negative integer.",
    });
  }
  return limit;
}

export function parsePriority(value: string | number | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value === "number") {
    if (Number.isInteger(value) && value >= 0 && value <= 4) {
      return value;
    }
    throw new LeanError("invalid_argument", `Invalid --priority: ${value}`, {
      action: "Use 0-4 or one of None, Urgent, High, Medium, Low.",
    });
  }

  const trimmed = trimValue(value, "--priority");
  const numeric = Number(trimmed);
  if (Number.isInteger(numeric) && numeric >= 0 && numeric <= 4) {
    return numeric;
  }

  const normalized = trimmed.toLowerCase().replace(/[\s_-]+/g, "");
  const labels: Record<string, number> = {
    none: 0,
    nopriority: 0,
    urgent: 1,
    high: 2,
    medium: 3,
    normal: 3,
    low: 4,
  };
  const parsed = labels[normalized];
  if (parsed !== undefined) {
    return parsed;
  }

  throw new LeanError("invalid_argument", `Invalid --priority: ${value}`, {
    action: "Use 0-4 or one of None, Urgent, High, Medium, Low.",
  });
}

export function validateDueDate(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  const trimmed = trimValue(value, "--due-date");
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (!match) {
    throw new LeanError("invalid_argument", `Invalid --due-date: ${value}`, {
      action: "Use YYYY-MM-DD.",
    });
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new LeanError("invalid_argument", `Invalid --due-date: ${value}`, {
      action: "Use a real calendar date in YYYY-MM-DD format.",
    });
  }
  return trimmed;
}

export function parseSortOrder(value: string | number | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  const parsed = typeof value === "number" ? value : Number(trimValue(value, "--sub-issue-sort-order"));
  if (!Number.isFinite(parsed)) {
    throw new LeanError("invalid_argument", `Invalid --sub-issue-sort-order: ${value}`, {
      action: "Use a number.",
    });
  }
  return parsed;
}

export async function readOptionalFile(flagValue: string | undefined, flagName: string): Promise<string | undefined> {
  if (flagValue === undefined) {
    return undefined;
  }
  try {
    return await readFile(flagValue, "utf-8");
  } catch (err) {
    throw new LeanError("invalid_argument", `Could not read ${flagName}: ${flagValue}`, { cause: err });
  }
}

export async function lookupIssue(
  client: LinearClient,
  reference: string,
  opts: { extended?: boolean } = {}
): Promise<LinearIssueSummary | null> {
  const fields = opts.extended ? ISSUE_EXTENDED_FIELDS : ISSUE_CORE_FIELDS;

  if (UUID_RE.test(reference)) {
    const res: RawResponse<{ issue: LinearIssueSummary | null }> = await client.client.rawRequest<
      { issue: LinearIssueSummary | null },
      { id: string }
    >(`query LookupIssueById($id: String!) { issue(id: $id) { ${fields} } }`, { id: reference });
    throwRawGraphQlErrors(res);
    return res.data?.issue ?? null;
  }

  const match = TEAM_NUMBER_RE.exec(reference);
  if (match) {
    const teamKey = match[1]!;
    const number = Number(match[2]!);
    const res: RawResponse<{ issues: { nodes: LinearIssueSummary[] } }> = await client.client.rawRequest<
      { issues: { nodes: LinearIssueSummary[] } },
      { filter: unknown }
    >(
      `query LookupIssueByKey($filter: IssueFilter!) {
         issues(filter: $filter, first: 1) { nodes { ${fields} } }
       }`,
      {
        filter: {
          team: { key: { eq: teamKey } },
          number: { eq: number },
        },
      }
    );
    throwRawGraphQlErrors(res);
    return res.data?.issues?.nodes[0] ?? null;
  }

  return null;
}

export async function requireIssue(
  client: LinearClient,
  reference: string,
  opts: { extended?: boolean } = {}
): Promise<LinearIssueSummary> {
  const issue = await lookupIssue(client, reference, opts);
  if (!issue) {
    throw new LeanError("not_found", `Issue not found: ${reference}`);
  }
  return issue;
}

export async function resolveIssueId(client: LinearClient, reference: string): Promise<string> {
  return (await requireIssue(client, reference)).id;
}

export async function resolveAssigneeId(client: LinearClient, assignee: string): Promise<string> {
  if (assignee === "@me") {
    const me = await client.viewer;
    return me.id;
  }
  const users = await client.users({ filter: { email: { eq: assignee } } });
  const user = users.nodes.find(u => u.email === assignee);
  if (!user) {
    throw new LeanError("not_found", `User not found: ${assignee}`);
  }
  return user.id;
}

export async function resolveStateId(client: LinearClient, teamId: string, stateName: string): Promise<string> {
  const team = await client.team(teamId);
  const states = await team.states();
  const match = states.nodes.find(s => s.name.toLowerCase() === stateName.toLowerCase());
  if (!match) {
    throw new LeanError("not_found", `State not found: ${stateName}`);
  }
  return match.id;
}

export async function findFirstCompletedState(client: LinearClient, teamId: string): Promise<string | null> {
  const team = await client.team(teamId);
  const states = await team.states();
  const completed = states.nodes.filter(s => s.type === "completed").sort((a, b) => a.position - b.position);
  return completed[0]?.id ?? null;
}

export function issuePayload(issue: LinearIssueSummary, opts: IssuePayloadOptions = {}): IssueJson {
  const payload: IssueJson = {
    id: issue.identifier,
    title: issue.title,
  };

  if (opts.includeDescription) {
    payload.description = issue.description && issue.description.length > 0 ? issue.description : null;
  }
  if (issue.state !== undefined) {
    payload.state = issue.state?.name ?? null;
  }
  if (issue.priority !== undefined) {
    payload.priority = issue.priority;
    payload.priorityLabel = priorityLabel(issue.priority);
  }
  if (issue.assignee !== undefined) {
    payload.assignee = issue.assignee?.email ?? null;
  }
  if (opts.includeParent || issue.parent) {
    payload.parent = issue.parent?.identifier ?? null;
  }
  if (opts.includeProject) {
    payload.project = issue.project ? projectPayload({ ...issue.project, team: issue.team ?? null }) : null;
  }
  if (opts.includeDueDate || issue.dueDate) {
    payload.dueDate = issue.dueDate ?? null;
  }
  if (opts.includeSubIssueSortOrder || issue.subIssueSortOrder !== undefined) {
    payload.subIssueSortOrder = issue.subIssueSortOrder ?? null;
  }
  if (opts.includeUrl !== false) {
    payload.url = issue.url;
  }
  if (opts.children !== undefined) {
    payload.children = opts.children.map(child =>
      issuePayload(child, {
        includeUrl: true,
        includeDueDate: true,
        includeParent: false,
        includeProject: false,
      })
    );
  }

  return payload;
}

export function graphQlMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function isUnsupportedGraphQlField(err: unknown, fields: string[]): boolean {
  const message = graphQlMessage(err);
  return (
    /Cannot query field|Unknown field|Unknown argument|Field .* is not defined|is not defined by type/i.test(message) &&
    fields.some(field => message.includes(field))
  );
}
