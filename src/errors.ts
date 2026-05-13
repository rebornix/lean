/**
 * Stable, machine-readable error identifiers used by `lean`.
 *
 * Each value also maps to an exit code via {@link exitCodeFor}.
 */
export type LeanErrorCode =
  | "missing_required_flag"
  | "not_found"
  | "invalid_argument"
  | "prompt_required_in_non_tty"
  | "auth_required"
  | "auth_invalid"
  | "network"
  | "linear_api"
  | "internal";

export interface LeanErrorOptions {
  action?: string;
  details?: Record<string, unknown>;
  exitCode?: number;
  cause?: unknown;
}

export class LeanError extends Error {
  readonly code: LeanErrorCode;
  readonly action?: string;
  readonly details?: Record<string, unknown>;
  readonly exitCode: number;

  constructor(code: LeanErrorCode, message: string, opts: LeanErrorOptions = {}) {
    super(message);
    this.name = "LeanError";
    this.code = code;
    if (opts.action !== undefined) {
      this.action = opts.action;
    }
    if (opts.details !== undefined) {
      this.details = opts.details;
    }
    this.exitCode = opts.exitCode ?? exitCodeFor(code);
    if (opts.cause !== undefined) {
      Object.defineProperty(this, "cause", { value: opts.cause, enumerable: false });
    }
  }
}

export function exitCodeFor(code: LeanErrorCode): number {
  switch (code) {
    case "auth_required":
    case "auth_invalid":
      return 2;
    case "network":
      return 3;
    case "internal":
      return 4;
    case "missing_required_flag":
    case "not_found":
    case "invalid_argument":
    case "prompt_required_in_non_tty":
    case "linear_api":
      return 1;
    default: {
      // Exhaustive check: if a new LeanErrorCode is added without a
      // matching case here, TypeScript will complain.
      const _exhaustive: never = code;
      return _exhaustive;
    }
  }
}
