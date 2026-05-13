import type { Command } from "commander";
import { readFile } from "node:fs/promises";
import { getClient } from "../api/client.js";
import { LeanError } from "../errors.js";

const PAGE_CAP = 50;

interface ApiOpts {
  query?: string;
  queryFile?: string;
  variable?: string[];
  operation?: string;
  paginate?: boolean;
  json?: boolean;
}

export function registerApiCommand(program: Command): void {
  const cmd = program
    .command("api")
    .description("Send a raw GraphQL request to Linear")
    .option("--query <gql>", "Inline GraphQL document")
    .option("--query-file <path>", "Read query from file")
    .option("--variable <kv...>", "Variable: key=value, repeatable")
    .option("--operation <name>", "Operation name when document has multiple")
    .option("--paginate", "Walk pageInfo.endCursor and merge nodes (cap 50)")
    .option("--json", "Force JSON output (default for this command)")
    .action(async (opts: ApiOpts) => {
      await runApi(opts);
    });
  // The usage subcommand is wired by index.ts via registerSubcommandUsage.
  return cmd as unknown as void;
}

async function runApi(opts: ApiOpts): Promise<void> {
  if (opts.query && opts.queryFile) {
    throw new LeanError("invalid_argument", "Pass --query or --query-file, not both");
  }
  const query = opts.queryFile ? await readFile(opts.queryFile, "utf-8") : opts.query;
  if (!query || query.trim().length === 0) {
    throw new LeanError("missing_required_flag", "--query or --query-file is required");
  }

  const variables = parseVariables(opts.variable ?? []);
  const client = getClient();

  if (opts.paginate) {
    const data = await paginate(client, query, variables);
    process.stdout.write(JSON.stringify({ data }, null, 2) + "\n");
    return;
  }

  const result = await client.client.rawRequest<Record<string, unknown>, Record<string, unknown>>(query, variables);
  process.stdout.write(JSON.stringify({ data: result.data ?? null }, null, 2) + "\n");
}

export function parseVariables(pairs: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const pair of pairs) {
    const eq = pair.indexOf("=");
    if (eq < 1) {
      throw new LeanError("invalid_argument", `--variable must be key=value: ${pair}`);
    }
    const key = pair.slice(0, eq);
    const raw = pair.slice(eq + 1);
    out[key] = parseValue(raw);
  }
  return out;
}

function parseValue(raw: string): unknown {
  if (raw === "") {
    return "";
  }
  const first = raw[0]!;
  const tryJson = (): unknown => {
    try {
      return JSON.parse(raw);
    } catch {
      return undefined;
    }
  };
  if (first === "{" || first === "[" || first === '"') {
    const parsed = tryJson();
    if (parsed === undefined) {
      throw new LeanError("invalid_argument", `--variable value looks like JSON but failed to parse: ${raw}`);
    }
    return parsed;
  }
  if (first === "-" || (first >= "0" && first <= "9")) {
    const n = Number(raw);
    if (!Number.isNaN(n)) {
      return n;
    }
  }
  if (raw === "true") {
    return true;
  }
  if (raw === "false") {
    return false;
  }
  if (raw === "null") {
    return null;
  }
  return raw;
}

interface ConnectionLike {
  nodes: unknown[];
  pageInfo: { endCursor: string | null; hasNextPage: boolean };
}

function findConnectionPath(value: unknown, path: string[] = []): string[] | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const obj = value as Record<string, unknown>;
  if (
    Array.isArray(obj.nodes) &&
    obj.pageInfo &&
    typeof obj.pageInfo === "object" &&
    "endCursor" in (obj.pageInfo as object)
  ) {
    return path;
  }
  for (const [key, child] of Object.entries(obj)) {
    const found = findConnectionPath(child, [...path, key]);
    if (found) {
      return found;
    }
  }
  return null;
}

function getAtPath(root: unknown, path: string[]): unknown {
  let cur: unknown = root;
  for (const k of path) {
    if (!cur || typeof cur !== "object") {
      return undefined;
    }
    cur = (cur as Record<string, unknown>)[k];
  }
  return cur;
}

function setAtPath(root: unknown, path: string[], value: unknown): void {
  let cur = root as Record<string, unknown>;
  for (let i = 0; i < path.length - 1; i++) {
    cur = cur[path[i]!] as Record<string, unknown>;
  }
  cur[path[path.length - 1]!] = value;
}

async function paginate(
  client: ReturnType<typeof getClient>,
  query: string,
  variables: Record<string, unknown>
): Promise<unknown> {
  const first = await client.client.rawRequest<Record<string, unknown>, Record<string, unknown>>(query, variables);
  const root = (first.data ?? null) as unknown;
  if (root === null) {
    return null;
  }

  const path = findConnectionPath(root);
  if (!path) {
    throw new LeanError("linear_api", "No Connection (nodes + pageInfo) found in response for --paginate");
  }

  let conn = getAtPath(root, path) as ConnectionLike;
  const merged: unknown[] = [...conn.nodes];
  let pages = 1;

  while (conn.pageInfo?.hasNextPage && conn.pageInfo.endCursor && pages < PAGE_CAP) {
    const next = await client.client.rawRequest<Record<string, unknown>, Record<string, unknown>>(query, {
      ...variables,
      after: conn.pageInfo.endCursor,
    });
    const nextRoot = next.data as unknown;
    const nextConn = getAtPath(nextRoot, path) as ConnectionLike | undefined;
    if (!nextConn) {
      break;
    }
    merged.push(...nextConn.nodes);
    conn = nextConn;
    pages += 1;
  }

  if (pages >= PAGE_CAP && conn.pageInfo?.hasNextPage) {
    throw new LeanError("linear_api", `--paginate hit safety cap of ${PAGE_CAP} pages`);
  }

  setAtPath(root, [...path, "nodes"], merged);
  setAtPath(root, [...path, "pageInfo"], { ...conn.pageInfo, hasNextPage: false });
  return root;
}
