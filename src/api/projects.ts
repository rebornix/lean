import { getClient } from "./client.js";
import { LeanError } from "../errors.js";

export interface LinearProjectSummary {
  id: string;
  name: string;
  slugId: string;
  state: string;
  team?: { id: string; key: string } | null;
}

export interface LinearTeamSummary {
  id: string;
  key: string;
}

export const PROJECT_FIELDS = `
  id name slugId state
`;

type LinearClient = ReturnType<typeof getClient>;
type PageInfo = {
  hasNextPage: boolean;
  endCursor: string | null;
};
type ProjectConnection = { nodes: LinearProjectSummary[]; pageInfo: PageInfo };
type RawResponse<T> = { data?: T };
type TeamsQuery = { teams: { nodes: LinearTeamSummary[]; pageInfo: PageInfo } };
type TeamProjectsQuery = { team: { projects: ProjectConnection } | null };

const PAGE_SIZE = 100;

function sameText(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

function containsText(a: string, b: string): boolean {
  return a.toLowerCase().includes(b.toLowerCase());
}

function matchesProjectExactly(project: LinearProjectSummary, reference: string): boolean {
  return sameText(project.id, reference) || sameText(project.name, reference) || sameText(project.slugId, reference);
}

function matchesProjectFuzzy(project: LinearProjectSummary, reference: string): boolean {
  return containsText(project.name, reference) || containsText(project.slugId, reference);
}

function projectDetails(projects: LinearProjectSummary[]): Record<string, unknown> {
  return {
    matches: projects.map(project => ({
      id: project.id,
      name: project.name,
      slugId: project.slugId,
      state: project.state,
    })),
  };
}

export function projectPayload(project: LinearProjectSummary): Record<string, string | null> {
  return {
    id: project.id,
    name: project.name,
    slugId: project.slugId,
    state: project.state,
    team: project.team?.key ?? null,
  };
}

export async function findTeamByKey(client: LinearClient, key: string): Promise<LinearTeamSummary> {
  const teams = await client.teams({ filter: { key: { eq: key } } });
  const team = teams.nodes.find(t => t.key === key) ?? null;
  if (!team) {
    throw new LeanError("not_found", `Team not found: ${key}`);
  }
  return { id: team.id, key: team.key };
}

async function listTeams(client: LinearClient): Promise<LinearTeamSummary[]> {
  const teams: LinearTeamSummary[] = [];
  let after: string | null = null;

  do {
    const result: RawResponse<TeamsQuery> = await client.client.rawRequest<
      TeamsQuery,
      { first: number; after: string | null }
    >(
      `query Teams($first: Int!, $after: String) {
         teams(first: $first, after: $after) {
           nodes { id key }
           pageInfo { hasNextPage endCursor }
         }
      }`,
      { first: PAGE_SIZE, after }
    );
    const connection: TeamsQuery["teams"] | undefined = result.data?.teams;
    teams.push(...(connection?.nodes ?? []));
    after = connection?.pageInfo.hasNextPage ? (connection.pageInfo.endCursor ?? null) : null;
  } while (after);

  return teams;
}

async function listTeamProjects(
  client: LinearClient,
  team: LinearTeamSummary,
  opts: { limit?: number; state?: string }
): Promise<LinearProjectSummary[]> {
  const projects: LinearProjectSummary[] = [];
  let after: string | null = null;

  while (opts.limit === undefined || projects.length < opts.limit) {
    const remaining = opts.limit === undefined ? PAGE_SIZE : opts.limit - projects.length;
    const first = opts.state ? PAGE_SIZE : Math.min(PAGE_SIZE, remaining);
    if (first <= 0) {
      break;
    }

    const result: RawResponse<TeamProjectsQuery> = await client.client.rawRequest<
      TeamProjectsQuery,
      { id: string; first: number; after: string | null }
    >(
      `query TeamProjects($id: String!, $first: Int!, $after: String) {
         team(id: $id) {
           projects(first: $first, after: $after) {
             nodes { ${PROJECT_FIELDS} }
             pageInfo { hasNextPage endCursor }
           }
         }
       }`,
      { id: team.id, first, after }
    );

    const connection: ProjectConnection | undefined = result.data?.team?.projects;
    const page = (connection?.nodes ?? []).map((project: LinearProjectSummary) => ({ ...project, team }));
    const filtered = opts.state ? page.filter(project => sameText(project.state, opts.state!)) : page;
    projects.push(...filtered);

    if (opts.limit !== undefined && projects.length >= opts.limit) {
      return projects.slice(0, opts.limit);
    }
    after = connection?.pageInfo.hasNextPage ? (connection.pageInfo.endCursor ?? null) : null;
    if (!after) {
      break;
    }
  }

  return projects;
}

export async function listProjects(
  client: LinearClient,
  opts: { team?: LinearTeamSummary; limit?: number; state?: string }
): Promise<LinearProjectSummary[]> {
  if (opts.team) {
    return listTeamProjects(client, opts.team, { limit: opts.limit, state: opts.state });
  }

  const projects: LinearProjectSummary[] = [];
  const teams = await listTeams(client);
  for (const team of teams) {
    if (opts.limit !== undefined && projects.length >= opts.limit) {
      break;
    }
    const remaining = opts.limit === undefined ? undefined : opts.limit - projects.length;
    projects.push(...(await listTeamProjects(client, team, { limit: remaining, state: opts.state })));
  }
  return opts.limit === undefined ? projects : projects.slice(0, opts.limit);
}

export async function resolveProjectForTeam(
  client: LinearClient,
  team: LinearTeamSummary,
  reference: string
): Promise<LinearProjectSummary> {
  const trimmed = reference.trim();
  if (trimmed.length === 0) {
    throw new LeanError("invalid_argument", "--project cannot be empty");
  }

  const projects = await listProjects(client, { team });
  const exact = projects.filter(project => matchesProjectExactly(project, trimmed));
  if (exact.length === 1) {
    return exact[0]!;
  }
  if (exact.length > 1) {
    throw new LeanError("invalid_argument", `Project reference is ambiguous for team ${team.key}: ${reference}`, {
      action: "Use a project id or slugId instead of a name.",
      details: projectDetails(exact),
    });
  }

  const fuzzy = projects.filter(project => matchesProjectFuzzy(project, trimmed));
  if (fuzzy.length === 1) {
    return fuzzy[0]!;
  }
  if (fuzzy.length > 1) {
    throw new LeanError("invalid_argument", `Project reference is ambiguous for team ${team.key}: ${reference}`, {
      action: "Use a project id or slugId instead of a partial name.",
      details: projectDetails(fuzzy),
    });
  }

  throw new LeanError("not_found", `Project not found for team ${team.key}: ${reference}`, {
    action: "Use a project id, exact name, slugId, or a unique partial name.",
  });
}
