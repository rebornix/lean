import { getClient } from "./client.js";
import { LeanError } from "../errors.js";
import { readOptionalFile, requireIssue, throwRawGraphQlErrors } from "./issues.js";

type LinearClient = ReturnType<typeof getClient>;
type RawResponse<T> = { data?: T; errors?: { message?: string }[] };

export interface LinearCommentSummary {
  id: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  issue?: { id: string; identifier?: string | null } | null;
  user?: { id: string; name?: string | null; email?: string | null } | null;
}

export interface CommentJson {
  id: string;
  issue: string | null;
  body: string;
  user: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DeleteCommentJson {
  id: string;
  deleted: true;
}

interface CommentBodyOptions {
  body?: string;
  bodyFile?: string;
}

const COMMENT_FIELDS = `
  id body createdAt updatedAt
  issue { id identifier }
  user { id name email }
`;

export async function readRequiredCommentBody(opts: CommentBodyOptions): Promise<string> {
  if (opts.body !== undefined && opts.bodyFile !== undefined) {
    throw new LeanError("invalid_argument", "--body and --body-file are mutually exclusive");
  }
  if (opts.body === undefined && opts.bodyFile === undefined) {
    throw new LeanError("missing_required_flag", "--body or --body-file is required", {
      action: "Provide --body <text> or --body-file <path>",
    });
  }

  const body = opts.bodyFile !== undefined ? await readOptionalFile(opts.bodyFile, "--body-file") : opts.body;
  if (body === undefined || body.trim().length === 0) {
    throw new LeanError("invalid_argument", "Comment body cannot be empty");
  }
  return body;
}

export function commentPayload(comment: LinearCommentSummary, fallbackIssue?: string): CommentJson {
  return {
    id: comment.id,
    issue: comment.issue?.identifier ?? fallbackIssue ?? null,
    body: comment.body,
    user: comment.user?.email ?? comment.user?.name ?? null,
    createdAt: comment.createdAt,
    updatedAt: comment.updatedAt,
  };
}

export async function addIssueComment(
  client: LinearClient,
  issueReference: string,
  body: string
): Promise<LinearCommentSummary> {
  const issue = await requireIssue(client, issueReference);
  const result: RawResponse<{ commentCreate: { comment: LinearCommentSummary | null } }> =
    await client.client.rawRequest<
      { commentCreate: { comment: LinearCommentSummary | null } },
      { input: Record<string, unknown> }
    >(
      `mutation CommentCreate($input: CommentCreateInput!) {
         commentCreate(input: $input) { comment { ${COMMENT_FIELDS} } }
       }`,
      { input: { issueId: issue.id, body } }
    );
  throwRawGraphQlErrors(result);

  const comment = result.data?.commentCreate.comment;
  if (!comment) {
    throw new LeanError("linear_api", "commentCreate did not return a comment");
  }
  return comment;
}

export async function listIssueComments(
  client: LinearClient,
  issueReference: string,
  opts: { first: number }
): Promise<{ issue: string; comments: LinearCommentSummary[] }> {
  const issue = await requireIssue(client, issueReference);
  const result: RawResponse<{ issue: { identifier: string; comments: { nodes: LinearCommentSummary[] } } | null }> =
    await client.client.rawRequest<
      { issue: { identifier: string; comments: { nodes: LinearCommentSummary[] } } | null },
      { id: string; first: number }
    >(
      `query IssueComments($id: String!, $first: Int!) {
         issue(id: $id) {
           identifier
           comments(first: $first) { nodes { ${COMMENT_FIELDS} } }
         }
       }`,
      { id: issue.id, first: opts.first }
    );
  throwRawGraphQlErrors(result);

  return {
    issue: result.data?.issue?.identifier ?? issue.identifier,
    comments: result.data?.issue?.comments.nodes ?? [],
  };
}

export async function lookupComment(client: LinearClient, id: string): Promise<LinearCommentSummary | null> {
  const quotedId = JSON.stringify(id);
  const result: RawResponse<{ comment: LinearCommentSummary | null }> = await client.client.rawRequest<
    { comment: LinearCommentSummary | null },
    Record<string, never>
  >(
    `query Comment {
       comment(id: ${quotedId}) { ${COMMENT_FIELDS} }
     }`,
    {}
  );
  throwRawGraphQlErrors(result);
  return result.data?.comment ?? null;
}

export async function requireComment(client: LinearClient, id: string): Promise<LinearCommentSummary> {
  const comment = await lookupComment(client, id);
  if (!comment) {
    throw new LeanError("not_found", `Comment not found: ${id}`);
  }
  return comment;
}

export async function updateIssueComment(
  client: LinearClient,
  id: string,
  body: string
): Promise<LinearCommentSummary> {
  await requireComment(client, id);
  const result: RawResponse<{ commentUpdate: { comment: LinearCommentSummary | null } }> =
    await client.client.rawRequest<
      { commentUpdate: { comment: LinearCommentSummary | null } },
      { id: string; input: Record<string, unknown> }
    >(
      `mutation CommentUpdate($id: String!, $input: CommentUpdateInput!) {
         commentUpdate(id: $id, input: $input) { comment { ${COMMENT_FIELDS} } }
       }`,
      { id, input: { body } }
    );
  throwRawGraphQlErrors(result);

  const comment = result.data?.commentUpdate.comment;
  if (!comment) {
    throw new LeanError("linear_api", "commentUpdate did not return a comment");
  }
  return comment;
}

export async function deleteIssueComment(client: LinearClient, id: string): Promise<DeleteCommentJson> {
  await requireComment(client, id);
  const result: RawResponse<{ commentDelete: { success: boolean; entity?: string | null } }> =
    await client.client.rawRequest<{ commentDelete: { success: boolean; entity?: string | null } }, { id: string }>(
      `mutation CommentDelete($id: String!) {
         commentDelete(id: $id) { success entity }
       }`,
      { id }
    );
  throwRawGraphQlErrors(result);

  if (!result.data?.commentDelete.success) {
    throw new LeanError("linear_api", "commentDelete did not report success");
  }
  return { id: result.data.commentDelete.entity ?? id, deleted: true };
}
