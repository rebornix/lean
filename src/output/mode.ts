export interface OutputMode {
  /** True when output should be machine-readable (no prompts, JSON errors). */
  agent: boolean;
  /** True when --json was explicitly passed. */
  json: boolean;
  /** True when ANSI color codes should be emitted. */
  color: boolean;
}

interface DetectInput {
  json?: boolean;
  format?: string;
}

export function detectMode(opts: DetectInput = {}): OutputMode {
  const text = opts.format === "text" || process.env.LEAN_FORCE_FORMAT === "text";
  const json = Boolean(opts.json) || opts.format === "json" || process.env.LEAN_FORCE_FORMAT === "json";
  const stdoutTty = Boolean(process.stdout.isTTY);
  const agent = json || (!text && !stdoutTty);
  const noColor = process.env.NO_COLOR !== undefined && process.env.NO_COLOR !== "";
  const forceColorZero = process.env.FORCE_COLOR === "0";
  const color = stdoutTty && !noColor && !forceColorZero;
  return { agent, json, color };
}
