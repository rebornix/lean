import { Command, CommanderError } from "commander";
import { LeanError, type LeanErrorCode, exitCodeFor } from "./errors.js";
import { detectMode } from "./output/mode.js";

interface ReportShape {
  error: LeanErrorCode;
  message: string;
  action?: string;
  exit_code: number;
  details?: Record<string, unknown>;
}

function jsonFlagFromArgv(): boolean {
  return process.argv.includes("--json");
}

function classifyUnknown(err: unknown): LeanError {
  if (err instanceof LeanError) {
    return err;
  }

  if (err instanceof CommanderError) {
    // commander uses its own codes (e.g. commander.helpDisplayed). Only
    // surface real errors; --help / --version are normal exits.
    if (err.exitCode === 0) {
      process.exit(0);
    }
    return new LeanError("missing_required_flag", err.message, { cause: err });
  }

  if (err instanceof Error) {
    const anyErr = err as Error & {
      type?: string;
      status?: number;
      code?: string;
      errors?: { extensions?: { code?: string } }[];
    };

    if (anyErr.type === "AuthenticationError" || anyErr.status === 401 || anyErr.status === 403) {
      return new LeanError("auth_invalid", "Authentication failed", {
        action: "Check your API key with `lean auth status`",
        cause: err,
      });
    }

    const message = err.message ?? "";
    if (
      anyErr.code === "ECONNREFUSED" ||
      anyErr.code === "ENOTFOUND" ||
      anyErr.code === "ETIMEDOUT" ||
      /fetch failed|ECONNREFUSED|ENOTFOUND|ETIMEDOUT/i.test(message)
    ) {
      return new LeanError("network", `Could not reach Linear API: ${message}`, { cause: err });
    }

    // Classify GraphQL-shaped errors. The SDK wraps Linear errors in a
    // GraphQLClientError where individual error entries carry an
    // `extensions.code` (e.g. BAD_USER_INPUT, AUTHENTICATION_ERROR).
    const firstCode = anyErr.errors?.[0]?.extensions?.code;
    if (firstCode === "AUTHENTICATION_ERROR") {
      return new LeanError("auth_invalid", message || "Authentication failed", { cause: err });
    }
    if (
      anyErr.type === "GraphqlError" ||
      anyErr.type === "InvalidInput" ||
      anyErr.type === "UserError" ||
      firstCode === "BAD_USER_INPUT" ||
      firstCode === "GRAPHQL_VALIDATION_FAILED" ||
      firstCode === "GRAPHQL_ERROR" ||
      firstCode === "ENTITY_NOT_FOUND" ||
      message.startsWith("GraphQL Error") ||
      /GraphqlError|InvalidInput|UserError/i.test(anyErr.type ?? "")
    ) {
      return new LeanError("linear_api", message || "Linear API error", { cause: err });
    }

    return new LeanError("internal", message || "Unknown error", { cause: err });
  }

  return new LeanError("internal", String(err));
}

export function reportError(err: unknown): never {
  const lean = classifyUnknown(err);
  const mode = detectMode({ json: jsonFlagFromArgv() });
  const exitCode = lean.exitCode || exitCodeFor(lean.code);

  if (mode.agent) {
    const payload: ReportShape = {
      error: lean.code,
      message: lean.message,
      exit_code: exitCode,
    };
    if (lean.action) {
      payload.action = lean.action;
    }
    if (lean.details) {
      payload.details = lean.details;
    }
    process.stderr.write(JSON.stringify(payload, null, 2) + "\n");
  } else {
    process.stderr.write(`Error: ${lean.message}\n`);
    if (lean.action) {
      process.stderr.write(`Hint:  ${lean.action}\n`);
    }
  }

  process.exit(exitCode);
}

/** Helper: register a subcommand action with shared error semantics. */
export function action<T extends unknown[]>(cmd: Command, fn: (...args: T) => Promise<void> | void): Command {
  return cmd.action(async (...args: T) => {
    try {
      await fn(...args);
    } catch (err) {
      reportError(err);
    }
  });
}
