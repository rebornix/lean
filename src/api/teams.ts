import { getClient } from "./client.js";
import { LeanError } from "../errors.js";

export interface LinearTeamDetails {
  id: string;
  key: string;
  name: string;
}

export interface LinearWorkflowStateSummary {
  id: string;
  name: string;
  type: string;
  position: number;
}

export const TEAM_FIELDS = "id key name";

type LinearClient = ReturnType<typeof getClient>;
type PageInfo = {
  hasNextPage: boolean;
  endCursor: string | null;
};
type RawResponse<T> = { data?: T };

const PAGE_SIZE = 100;

export function teamPayload(team: LinearTeamDetails): Record<string, string> {
  return {
    id: team.id,
    key: team.key,
    name: team.name,
  };
}

export async function listTeams(client: LinearClient, limit?: number): Promise<LinearTeamDetails[]> {
  const teams: LinearTeamDetails[] = [];
  let after: string | null = null;

  while (limit === undefined || teams.length < limit) {
    const remaining = limit === undefined ? PAGE_SIZE : limit - teams.length;
    const first = Math.min(PAGE_SIZE, remaining);
    if (first <= 0) {
      break;
    }

    const result: RawResponse<{ teams: { nodes: LinearTeamDetails[]; pageInfo: PageInfo } }> =
      await client.client.rawRequest<
        { teams: { nodes: LinearTeamDetails[]; pageInfo: PageInfo } },
        { first: number; after: string | null }
      >(
        `query Teams($first: Int!, $after: String) {
           teams(first: $first, after: $after) {
             nodes { ${TEAM_FIELDS} }
             pageInfo { hasNextPage endCursor }
           }
         }`,
        { first, after }
      );

    const connection = result.data?.teams;
    teams.push(...(connection?.nodes ?? []));
    after = connection?.pageInfo.hasNextPage ? (connection.pageInfo.endCursor ?? null) : null;
    if (!after) {
      break;
    }
  }

  return limit === undefined ? teams : teams.slice(0, limit);
}

export async function findTeam(client: LinearClient, reference: string): Promise<LinearTeamDetails> {
  const trimmed = reference.trim();
  if (trimmed.length === 0) {
    throw new LeanError("invalid_argument", "Team reference cannot be empty");
  }

  const direct: RawResponse<{ team: LinearTeamDetails | null }> = await client.client.rawRequest<
    { team: LinearTeamDetails | null },
    { id: string }
  >(`query TeamById($id: String!) { team(id: $id) { ${TEAM_FIELDS} } }`, { id: trimmed });
  if (direct.data?.team) {
    return direct.data.team;
  }

  const byKey: RawResponse<{ teams: { nodes: LinearTeamDetails[] } }> = await client.client.rawRequest<
    { teams: { nodes: LinearTeamDetails[] } },
    { filter: unknown }
  >(
    `query TeamByKey($filter: TeamFilter!) {
       teams(first: 2, filter: $filter) { nodes { ${TEAM_FIELDS} } }
     }`,
    { filter: { key: { eq: trimmed.toUpperCase() } } }
  );
  const team = byKey.data?.teams.nodes.find(t => t.key.toLowerCase() === trimmed.toLowerCase()) ?? null;
  if (!team) {
    throw new LeanError("not_found", `Team not found: ${reference}`);
  }
  return team;
}

export async function listTeamStates(client: LinearClient, teamId: string): Promise<LinearWorkflowStateSummary[]> {
  const result: RawResponse<{ team: { states: { nodes: LinearWorkflowStateSummary[] } } | null }> =
    await client.client.rawRequest<
      { team: { states: { nodes: LinearWorkflowStateSummary[] } } | null },
      { id: string }
    >(
      `query TeamStates($id: String!) {
         team(id: $id) {
           states(first: 100) { nodes { id name type position } }
         }
       }`,
      { id: teamId }
    );
  return result.data?.team?.states.nodes ?? [];
}
