import { Option, type Command } from "commander";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { getClient } from "../api/client.js";
import {
  ISSUE_CORE_FIELDS,
  ISSUE_EXTENDED_FIELDS,
  compactInput,
  findFirstCompletedState,
  graphQlMessage,
  isUnsupportedGraphQlField,
  issuePayload,
  lookupIssue,
  parseLimit,
  parsePriority,
  parseSortOrder,
  readOptionalFile,
  requireIssue,
  resolveAssigneeId,
  resolveIssueId,
  resolveStateId,
  throwRawGraphQlErrors,
  validateDueDate,
  type IssueJson,
  type LinearIssueSummary,
} from "../api/issues.js";
import { findTeamByKey, resolveProjectForTeam, type LinearTeamSummary } from "../api/projects.js";
import { table, respond } from "../output/index.js";
import { priorityLabel } from "../output/priority.js";
import { LeanError } from "../errors.js";
import { truncate } from "../utils/text.js";

type LinearClient = ReturnType<typeof getClient>;

interface IssueCreateFields {
  team?: string;
  title?: string;
  description?: string;
  descriptionFile?: string;
  priority?: string | number;
  state?: string;
  assignee?: string;
  project?: string;
  parent?: string;
  dueDate?: string;
  subIssueSortOrder?: string | number;
}

interface IssueEditFields {
  title?: string;
  description?: string;
  descriptionFile?: string;
  priority?: string | number;
  state?: string;
  assignee?: string;
  project?: string | false | null;
  parent?: string | false | null;
  dueDate?: string | null;
  subIssueSortOrder?: string | number;
}

interface BulkFailure {
  index: number;
  title?: string;
  id?: string;
  error: string;
  message: string;
}

type JsonRecord = Record<string, unknown>;

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

function hasArg(name: string): boolean {
  return process.argv.includes(name);
}

function ensureDescriptionFlags(opts: { description?: string; descriptionFile?: string }): void {
  if (opts.description !== undefined && opts.descriptionFile !== undefined) {
    throw new LeanError("invalid_argument", "--description and --description-file are mutually exclusive");
  }
}

function buildListFilter(opts: {
  team?: string;
  state?: string;
  assignee?: string;
  all?: boolean;
  priority?: string | number;
}): Record<string, unknown> {
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

  const priority = parsePriority(opts.priority);
  if (priority !== undefined) {
    filter.priority = { eq: priority };
  }
  return filter;
}

function andFilters(filters: Record<string, unknown>[]): Record<string, unknown> {
  const active = filters.filter(filter => Object.keys(filter).length > 0);
  if (active.length === 0) {
    return {};
  }
  if (active.length === 1) {
    return active[0]!;
  }
  return { and: active };
}

async function listIssues(
  client: LinearClient,
  opts: { filter: Record<string, unknown>; first: number; extended?: boolean }
): Promise<LinearIssueSummary[]> {
  const fields = opts.extended ? ISSUE_EXTENDED_FIELDS : ISSUE_CORE_FIELDS;
  const result = await client.client.rawRequest<
    { issues: { nodes: LinearIssueSummary[] } },
    { filter: unknown; first: number }
  >(
    `query Issues($filter: IssueFilter, $first: Int!) {
       issues(filter: $filter, first: $first) { nodes { ${fields} } }
    }`,
    { filter: opts.filter, first: opts.first }
  );
  throwRawGraphQlErrors(result);
  return result.data?.issues?.nodes ?? [];
}

async function searchIssues(
  client: LinearClient,
  query: string,
  opts: { filter: Record<string, unknown>; team?: LinearTeamSummary; first: number }
): Promise<LinearIssueSummary[]> {
  const fallbackSearch = async (): Promise<LinearIssueSummary[]> => {
    const fallback = andFilters([opts.filter, { title: { contains: query } }]);
    return listIssues(client, { filter: fallback, first: opts.first });
  };

  try {
    const result = await client.client.rawRequest<
      { searchIssues: { nodes: LinearIssueSummary[] } },
      { term: string; first: number; teamId?: string; filter: unknown }
    >(
      `query SearchIssues($term: String!, $first: Int!, $teamId: String, $filter: IssueFilter) {
         searchIssues(term: $term, first: $first, teamId: $teamId, filter: $filter) {
           nodes { ${ISSUE_EXTENDED_FIELDS} }
         }
       }`,
      {
        term: query,
        first: opts.first,
        teamId: opts.team?.id,
        filter: opts.filter,
      }
    );
    throwRawGraphQlErrors(result);
    const nodes = result.data?.searchIssues?.nodes;
    return nodes ?? fallbackSearch();
  } catch (err) {
    if (!isUnsupportedGraphQlField(err, ["searchIssues", "dueDate", "parent", "subIssueSortOrder"])) {
      throw err;
    }
    return fallbackSearch();
  }
}

async function issueChildren(
  client: LinearClient,
  parentId: string,
  opts: { first: number; state?: string }
): Promise<LinearIssueSummary[]> {
  const filter = opts.state ? { state: { name: { eq: opts.state } } } : {};
  try {
    const result = await client.client.rawRequest<
      { issue: { children: { nodes: LinearIssueSummary[] } } | null },
      { id: string; first: number; filter: unknown }
    >(
      `query IssueChildren($id: String!, $first: Int!, $filter: IssueFilter) {
         issue(id: $id) {
           children(first: $first, filter: $filter) { nodes { ${ISSUE_EXTENDED_FIELDS} } }
         }
       }`,
      { id: parentId, first: opts.first, filter }
    );
    throwRawGraphQlErrors(result);
    return result.data?.issue?.children?.nodes ?? [];
  } catch (err) {
    if (isUnsupportedGraphQlField(err, ["children", "dueDate", "parent", "subIssueSortOrder"])) {
      return [];
    }
    throw err;
  }
}

async function createIssue(client: LinearClient, fields: IssueCreateFields): Promise<LinearIssueSummary> {
  if (!fields.team || !fields.title) {
    throw new LeanError("missing_required_flag", "--team and --title are required", {
      action: "Pass --team <key> and --title <text>",
    });
  }
  ensureDescriptionFlags(fields);

  const team = await findTeamByKey(client, fields.team);
  const description =
    fields.descriptionFile !== undefined
      ? await readOptionalFile(fields.descriptionFile, "descriptionFile")
      : fields.description;
  const stateId = fields.state ? await resolveStateId(client, team.id, fields.state) : undefined;
  const assigneeId = fields.assignee ? await resolveAssigneeId(client, fields.assignee) : undefined;
  const parentId = fields.parent ? await resolveIssueId(client, fields.parent) : undefined;
  const project = fields.project ? await resolveProjectForTeam(client, team, fields.project) : undefined;
  const priority = parsePriority(fields.priority);
  const dueDate = validateDueDate(fields.dueDate);
  const subIssueSortOrder = parseSortOrder(fields.subIssueSortOrder);
  const needsExtendedFields = parentId !== undefined || dueDate !== undefined || subIssueSortOrder !== undefined;
  const result = await client.client.rawRequest<
    { issueCreate: { issue: LinearIssueSummary | null } },
    { input: Record<string, unknown> }
  >(
    `mutation Create($input: IssueCreateInput!) {
       issueCreate(input: $input) { issue { ${needsExtendedFields ? ISSUE_EXTENDED_FIELDS : ISSUE_CORE_FIELDS} } }
     }`,
    {
      input: compactInput({
        teamId: team.id,
        title: fields.title,
        description,
        priority,
        stateId,
        assigneeId,
        projectId: project?.id,
        parentId,
        dueDate,
        subIssueSortOrder,
      }),
    }
  );
  throwRawGraphQlErrors(result);
  const created = result.data?.issueCreate.issue;
  if (!created) {
    throw new LeanError("linear_api", "issueCreate did not return an issue");
  }
  return created;
}

async function buildIssueUpdate(
  client: LinearClient,
  issue: LinearIssueSummary,
  fields: IssueEditFields
): Promise<Record<string, unknown>> {
  ensureDescriptionFlags(fields);
  if (hasArg("--parent") && hasArg("--no-parent")) {
    throw new LeanError("invalid_argument", "--parent and --no-parent are mutually exclusive");
  }
  if (hasArg("--project") && hasArg("--no-project")) {
    throw new LeanError("invalid_argument", "--project and --no-project are mutually exclusive");
  }

  const update: Record<string, unknown> = {};
  if (fields.title !== undefined) {
    update.title = fields.title;
  }
  if (fields.description !== undefined || fields.descriptionFile !== undefined) {
    update.description =
      fields.descriptionFile !== undefined
        ? await readOptionalFile(fields.descriptionFile, "descriptionFile")
        : fields.description;
  }
  const priority = parsePriority(fields.priority);
  if (priority !== undefined) {
    update.priority = priority;
  }
  if (fields.dueDate !== undefined) {
    update.dueDate = fields.dueDate === null ? null : validateDueDate(fields.dueDate);
  }
  const subIssueSortOrder = parseSortOrder(fields.subIssueSortOrder);
  if (subIssueSortOrder !== undefined) {
    update.subIssueSortOrder = subIssueSortOrder;
  }
  if (fields.state !== undefined) {
    if (!issue.team) {
      throw new LeanError("invalid_argument", "Issue has no team");
    }
    update.stateId = await resolveStateId(client, issue.team.id, fields.state);
  }
  if (fields.assignee !== undefined) {
    update.assigneeId = await resolveAssigneeId(client, fields.assignee);
  }
  if (fields.parent !== undefined) {
    update.parentId =
      fields.parent === false || fields.parent === null ? null : await resolveIssueId(client, fields.parent);
  }
  if (fields.project !== undefined) {
    if (fields.project === false || fields.project === null) {
      update.projectId = null;
    } else {
      if (!issue.team) {
        throw new LeanError("invalid_argument", "Issue has no team");
      }
      update.projectId = (await resolveProjectForTeam(client, issue.team, fields.project)).id;
    }
  }
  return update;
}

async function updateIssue(
  client: LinearClient,
  reference: string,
  fields: IssueEditFields
): Promise<LinearIssueSummary> {
  const issue = await requireIssue(client, reference);
  const update = await buildIssueUpdate(client, issue, fields);
  if (Object.keys(update).length === 0) {
    throw new LeanError("missing_required_flag", "No fields to update", {
      action: "Pass at least one editable field.",
    });
  }

  const needsExtendedFields = "dueDate" in update || "parentId" in update || "subIssueSortOrder" in update;
  const result = await client.client.rawRequest<
    { issueUpdate: { issue: LinearIssueSummary | null } },
    { id: string; input: Record<string, unknown> }
  >(
    `mutation Update($id: String!, $input: IssueUpdateInput!) {
       issueUpdate(id: $id, input: $input) { issue { ${needsExtendedFields ? ISSUE_EXTENDED_FIELDS : ISSUE_CORE_FIELDS} } }
    }`,
    { id: issue.id, input: update }
  );
  throwRawGraphQlErrors(result);
  const updated = result.data?.issueUpdate.issue;
  if (!updated) {
    throw new LeanError("linear_api", "issueUpdate did not return an issue");
  }
  return updated;
}

function renderIssueRows(issues: LinearIssueSummary[]): void {
  if (issues.length === 0) {
    console.log("No issues match.");
    return;
  }

  table(
    issues.map(i => ({
      ID: i.identifier,
      Title: truncate(i.title, 60),
      State: i.state?.name ?? "—",
      Priority: priorityLabel(i.priority),
      Assignee: i.assignee?.name ?? "—",
    }))
  );
}

function asRecord(value: unknown, label: string): JsonRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new LeanError("invalid_argument", `${label} must be an object`);
  }
  return value as JsonRecord;
}

function optionalString(value: unknown, label: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new LeanError("invalid_argument", `${label} must be a string`);
  }
  return value;
}

function optionalNullableString(value: unknown, label: string): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  if (typeof value !== "string") {
    throw new LeanError("invalid_argument", `${label} must be a string or null`);
  }
  return value;
}

function optionalNumberOrString(value: unknown, label: string): string | number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string" && typeof value !== "number") {
    throw new LeanError("invalid_argument", `${label} must be a string or number`);
  }
  return value;
}

function normalizeCreateItem(value: JsonRecord, index: number): IssueCreateFields {
  return {
    team: optionalString(value.team, `issues[${index}].team`),
    title: optionalString(value.title, `issues[${index}].title`),
    description: optionalString(value.description, `issues[${index}].description`),
    descriptionFile: optionalString(value.descriptionFile, `issues[${index}].descriptionFile`),
    priority: optionalNumberOrString(value.priority, `issues[${index}].priority`),
    state: optionalString(value.state, `issues[${index}].state`),
    assignee: optionalString(value.assignee, `issues[${index}].assignee`),
    project: optionalString(value.project, `issues[${index}].project`),
    parent: optionalString(value.parent, `issues[${index}].parent`),
    dueDate: optionalString(value.dueDate, `issues[${index}].dueDate`),
    subIssueSortOrder: optionalNumberOrString(value.subIssueSortOrder, `issues[${index}].subIssueSortOrder`),
  };
}

function normalizeEditItem(value: JsonRecord, index: number): { id: string; fields: IssueEditFields } {
  const id = optionalString(value.id, `updates[${index}].id`);
  if (!id) {
    throw new LeanError("invalid_argument", `updates[${index}].id is required`);
  }
  return {
    id,
    fields: {
      title: optionalString(value.title, `updates[${index}].title`),
      description: optionalString(value.description, `updates[${index}].description`),
      descriptionFile: optionalString(value.descriptionFile, `updates[${index}].descriptionFile`),
      priority: optionalNumberOrString(value.priority, `updates[${index}].priority`),
      state: optionalString(value.state, `updates[${index}].state`),
      assignee: optionalString(value.assignee, `updates[${index}].assignee`),
      project: optionalNullableString(value.project, `updates[${index}].project`),
      parent: optionalNullableString(value.parent, `updates[${index}].parent`),
      dueDate: optionalNullableString(value.dueDate, `updates[${index}].dueDate`),
      subIssueSortOrder: optionalNumberOrString(value.subIssueSortOrder, `updates[${index}].subIssueSortOrder`),
    },
  };
}

async function readJsonRecord(path: string): Promise<JsonRecord> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(path, "utf-8"));
  } catch (err) {
    throw new LeanError("invalid_argument", `Could not parse JSON file: ${path}`, { cause: err });
  }
  return asRecord(parsed, "Bulk file");
}

function failureFromError(index: number, err: unknown, context: { title?: string; id?: string }): BulkFailure {
  const lean = err instanceof LeanError ? err : null;
  return {
    index,
    ...context,
    error: lean?.code ?? "linear_api",
    message: lean?.message ?? graphQlMessage(err),
  };
}

export function registerIssueCommands(issue: Command): void {
  issue
    .command("list")
    .description("List issues (default: assigned to you)")
    .option("--team <team>", "Filter by team key")
    .option("--state <state>", "Filter by state name")
    .option("--assignee <assignee>", "Filter by assignee (@me, anyone, or email)")
    .option("--priority <priority>", "Filter by priority (0-4 or label)")
    .option("--limit <n>", "Max results", "25")
    .option("--all", "List all issues; equivalent to --assignee anyone")
    .option("--json", "Output as JSON")
    .option("--format <format>", "Output format: json or text")
    .action(async opts => {
      const client = getClient();
      const limit = parseLimit(opts.limit);
      const filter = buildListFilter(opts);
      const issues = await listIssues(client, { filter, first: limit });
      const payload = issues.map(i => issuePayload(i, { includeUrl: false }));
      respond(opts, payload, () => renderIssueRows(issues));
    });

  issue
    .command("search <query>")
    .description("Search issues by text")
    .option("--team <team>", "Filter by team key")
    .option("--state <state>", "Filter by state name")
    .option("--assignee <assignee>", "Filter by assignee (@me, anyone, or email)")
    .option("--priority <priority>", "Filter by priority (0-4 or label)")
    .option("--limit <n>", "Max results", "25")
    .option("--json", "Output as JSON")
    .option("--format <format>", "Output format: json or text")
    .action(async (query: string, opts) => {
      const client = getClient();
      const limit = parseLimit(opts.limit);
      const team = opts.team ? await findTeamByKey(client, opts.team) : undefined;
      const filter = buildListFilter({ ...opts, all: opts.assignee === "anyone" });
      const issues = await searchIssues(client, query, { filter, team, first: limit });
      const payload = issues.map(i => issuePayload(i));
      respond(opts, payload, () => renderIssueRows(issues));
    });

  issue
    .command("view <identifier>")
    .description("View an issue")
    .option("--json", "Output as JSON")
    .option("--format <format>", "Output format: json or text")
    .option("--web", "Open in browser")
    .action(async (identifier: string, opts) => {
      const client = getClient();
      const iss = await requireIssue(client, identifier);
      if (opts.web) {
        await openUrl(iss.url);
        return;
      }
      const description = iss.description && iss.description.length > 0 ? iss.description : null;
      respond(opts, issuePayload(iss, { includeDescription: true }), () => {
        console.log(`${iss.identifier}: ${iss.title}`);
        console.log(`State:    ${iss.state?.name ?? "—"}`);
        console.log(`Priority: ${priorityLabel(iss.priority)}`);
        console.log(`Assignee: ${iss.assignee?.name ?? "—"}`);
        console.log(`URL:      ${iss.url}`);
        console.log("");
        console.log(description ?? "(no description)");
      });
    });

  issue
    .command("children <identifier>")
    .description("List child issues")
    .option("--limit <n>", "Max results", "100")
    .option("--state <state>", "Filter by state name")
    .option("--json", "Output as JSON")
    .option("--format <format>", "Output format: json or text")
    .action(async (identifier: string, opts) => {
      const client = getClient();
      const parent = await requireIssue(client, identifier);
      const limit = parseLimit(opts.limit);
      const children = await issueChildren(client, parent.id, { first: limit, state: opts.state });
      const payload = children.map(child => issuePayload(child, { includeDueDate: true }));
      respond(opts, payload, () => {
        if (children.length === 0) {
          console.log("No child issues match.");
          return;
        }
        renderIssueRows(children);
      });
    });

  issue
    .command("tree <identifier>")
    .description("Show an issue with one level of child issues")
    .option("--limit <n>", "Max child results", "100")
    .option("--state <state>", "Filter child issues by state name")
    .option("--json", "Output as JSON")
    .option("--format <format>", "Output format: json or text")
    .action(async (identifier: string, opts) => {
      const client = getClient();
      let parent = await requireIssue(client, identifier);
      const limit = parseLimit(opts.limit);
      let children: LinearIssueSummary[] = [];
      try {
        parent = await requireIssue(client, identifier, { extended: true });
        children = await issueChildren(client, parent.id, { first: limit, state: opts.state });
      } catch (err) {
        if (!isUnsupportedGraphQlField(err, ["children", "dueDate", "parent", "subIssueSortOrder"])) {
          throw err;
        }
      }
      const payload = issuePayload(parent, { includeDueDate: true, children });
      respond(opts, payload, () => {
        console.log(`${parent.identifier}: ${parent.title}`);
        console.log(`State:    ${parent.state?.name ?? "—"}`);
        console.log(`Priority: ${priorityLabel(parent.priority)}`);
        console.log(`Assignee: ${parent.assignee?.name ?? "—"}`);
        if (children.length === 0) {
          console.log("");
          console.log("No child issues match.");
          return;
        }
        console.log("");
        renderIssueRows(children);
      });
    });

  issue
    .command("create")
    .description("Create an issue")
    .option("--team <team>", "Team key (e.g. ENG)")
    .option("--title <title>", "Issue title")
    .option("--description <description>", "Issue description")
    .option("--description-file <file>", "Read description from file")
    .option("--priority <priority>", "Priority 0-4 or label")
    .option("--state <state>", "Workflow state name")
    .option("--assignee <assignee>", "Assignee email or @me")
    .option("--project <project>", "Project id, name, slugId, or unique partial name")
    .option("--parent <issue>", "Parent issue identifier or UUID")
    .option("--due-date <YYYY-MM-DD>", "Issue due date")
    .option("--sub-issue-sort-order <number>", "Position in the parent issue's child list")
    .option("--json", "Output as JSON")
    .option("--format <format>", "Output format: json or text")
    .action(async opts => {
      const created = await createIssue(getClient(), opts);
      const payload = issuePayload(created, {
        includeProject: opts.project !== undefined,
        includeParent: opts.parent !== undefined,
        includeDueDate: opts.dueDate !== undefined,
        includeSubIssueSortOrder: opts.subIssueSortOrder !== undefined,
      });
      respond(opts, payload, () => {
        console.log(`${created.identifier}: ${created.title}`);
        if (created.project) {
          console.log(`Project: ${created.project.name}`);
        }
        if (created.parent) {
          console.log(`Parent: ${created.parent.identifier}`);
        }
        if (created.dueDate) {
          console.log(`Due: ${created.dueDate}`);
        }
      });
    });

  issue
    .command("edit <identifier>")
    .description("Edit an issue")
    .option("--title <title>", "New title")
    .option("--description <description>", "New description")
    .option("--description-file <file>", "Read new description from file")
    .option("--state <state>", "Workflow state name")
    .option("--priority <priority>", "Priority 0-4 or label")
    .option("--assignee <assignee>", "Assignee email or @me")
    .option("--project <project>", "Project id, name, slugId, or unique partial name")
    .addOption(new Option("--no-project", "Clear project").default(undefined))
    .option("--parent <issue>", "Parent issue identifier or UUID")
    .addOption(new Option("--no-parent", "Clear parent issue").default(undefined))
    .option("--due-date <YYYY-MM-DD>", "Issue due date")
    .option("--sub-issue-sort-order <number>", "Position in the parent issue's child list")
    .option("--json", "Output as JSON")
    .option("--format <format>", "Output format: json or text")
    .action(async (identifier: string, opts) => {
      const updated = await updateIssue(getClient(), identifier, opts);
      const payload = issuePayload(updated, {
        includeDescription: opts.description !== undefined || opts.descriptionFile !== undefined,
        includeProject: opts.project !== undefined,
        includeParent: opts.parent !== undefined,
        includeDueDate: opts.dueDate !== undefined,
        includeSubIssueSortOrder: opts.subIssueSortOrder !== undefined,
      });
      respond(opts, payload, () => {
        console.log(`${updated.identifier}: ${updated.title}`);
      });
    });

  issue
    .command("bulk-create")
    .description("Create issues from a JSON file")
    .requiredOption("--file <file>", "JSON input file")
    .option("--continue-on-error", "Attempt remaining issues after an item fails")
    .option("--json", "Output as JSON")
    .option("--format <format>", "Output format: json or text")
    .action(async opts => {
      const file = await readJsonRecord(opts.file);
      const defaults = file.defaults === undefined ? {} : asRecord(file.defaults, "defaults");
      if (!Array.isArray(file.issues) || file.issues.length === 0) {
        throw new LeanError("invalid_argument", "Bulk file must contain a non-empty issues array");
      }
      const items = file.issues.map((item, index) =>
        normalizeCreateItem({ ...defaults, ...asRecord(item, `issues[${index}]`) }, index)
      );
      const client = getClient();
      const created: IssueJson[] = [];
      const failed: BulkFailure[] = [];
      for (const [index, item] of items.entries()) {
        try {
          const createdIssue = await createIssue(client, item);
          created.push(
            issuePayload(createdIssue, {
              includeProject: item.project !== undefined,
              includeParent: item.parent !== undefined,
              includeDueDate: item.dueDate !== undefined,
              includeSubIssueSortOrder: item.subIssueSortOrder !== undefined,
            })
          );
        } catch (err) {
          failed.push(failureFromError(index, err, { title: item.title }));
          if (!opts.continueOnError) {
            break;
          }
        }
      }
      if (failed.length > 0) {
        process.exitCode = 1;
      }
      respond(opts, { created, failed }, () => {
        console.log(`Created ${created.length} issue(s); failed ${failed.length}.`);
      });
    });

  issue
    .command("bulk-edit")
    .description("Edit issues from a JSON file")
    .requiredOption("--file <file>", "JSON input file")
    .option("--continue-on-error", "Attempt remaining updates after an item fails")
    .option("--json", "Output as JSON")
    .option("--format <format>", "Output format: json or text")
    .action(async opts => {
      const file = await readJsonRecord(opts.file);
      if (!Array.isArray(file.updates) || file.updates.length === 0) {
        throw new LeanError("invalid_argument", "Bulk file must contain a non-empty updates array");
      }
      const items = file.updates.map((item, index) => normalizeEditItem(asRecord(item, `updates[${index}]`), index));
      const client = getClient();
      const updated: IssueJson[] = [];
      const failed: BulkFailure[] = [];
      for (const [index, item] of items.entries()) {
        try {
          const updatedIssue = await updateIssue(client, item.id, item.fields);
          updated.push(
            issuePayload(updatedIssue, {
              includeDescription: item.fields.description !== undefined || item.fields.descriptionFile !== undefined,
              includeProject: item.fields.project !== undefined,
              includeParent: item.fields.parent !== undefined,
              includeDueDate: item.fields.dueDate !== undefined,
              includeSubIssueSortOrder: item.fields.subIssueSortOrder !== undefined,
            })
          );
        } catch (err) {
          failed.push(failureFromError(index, err, { id: item.id }));
          if (!opts.continueOnError) {
            break;
          }
        }
      }
      if (failed.length > 0) {
        process.exitCode = 1;
      }
      respond(opts, { updated, failed }, () => {
        console.log(`Updated ${updated.length} issue(s); failed ${failed.length}.`);
      });
    });

  issue
    .command("close <identifier>")
    .description("Move an issue to its team's first completed state")
    .option("--json", "Output as JSON")
    .option("--format <format>", "Output format: json or text")
    .action(async (identifier: string, opts) => {
      const client = getClient();
      const iss = await requireIssue(client, identifier);
      if (!iss.team) {
        throw new LeanError("invalid_argument", "Issue has no team");
      }
      const stateId = await findFirstCompletedState(client, iss.team.id);
      if (!stateId) {
        throw new LeanError("not_found", `No completed workflow state found for team ${iss.team.key}`);
      }
      const result = await client.client.rawRequest(
        `mutation Close($id: String!, $input: IssueUpdateInput!) {
           issueUpdate(id: $id, input: $input) { issue { identifier } }
         }`,
        { id: iss.id, input: { stateId } }
      );
      throwRawGraphQlErrors(result);
      respond(opts, { id: iss.identifier, closed: true }, () => {
        console.log(`Closed ${iss.identifier}`);
      });
    });

  issue
    .command("comment <identifier>")
    .description("Add a comment to an issue")
    .option("--body <body>", "Comment body")
    .option("--body-file <file>", "Read comment body from file")
    .option("--json", "Output as JSON")
    .option("--format <format>", "Output format: json or text")
    .action(async (identifier: string, opts) => {
      const body = opts.bodyFile ? await readFile(opts.bodyFile, "utf-8") : opts.body;
      if (!body) {
        throw new LeanError("missing_required_flag", "--body or --body-file is required", {
          action: "Provide --body <text> or --body-file <path>",
        });
      }
      const client = getClient();
      const iss = await lookupIssue(client, identifier);
      if (!iss) {
        throw new LeanError("not_found", `Issue not found: ${identifier}`);
      }
      const result = await client.client.rawRequest(
        `mutation Comment($input: CommentCreateInput!) {
           commentCreate(input: $input) { comment { id } }
         }`,
        { input: { issueId: iss.id, body } }
      );
      throwRawGraphQlErrors(result);
      respond(opts, { issue: iss.identifier, body }, () => {
        console.log(`Commented on ${iss.identifier}`);
      });
    });
}
