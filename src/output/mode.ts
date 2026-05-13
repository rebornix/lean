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
}

export function detectMode(opts: DetectInput = {}): OutputMode {
  const json = Boolean(opts.json);
  const stdoutTty = Boolean(process.stdout.isTTY);
  const agent = json || !stdoutTty;
  const noColor = process.env.NO_COLOR !== undefined && process.env.NO_COLOR !== "";
  const forceColorZero = process.env.FORCE_COLOR === "0";
  const color = stdoutTty && !noColor && !forceColorZero;
  return { agent, json, color };
}
