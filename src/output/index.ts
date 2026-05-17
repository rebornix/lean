import { detectMode } from "./mode.js";
import { LeanError } from "../errors.js";

interface OutputOpts {
  json?: boolean;
  format?: string;
}

export function json(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

export function respond<T>(opts: OutputOpts, data: T, renderHuman: (data: T) => void): void {
  if (opts.format !== undefined && opts.format !== "json" && opts.format !== "text") {
    throw new LeanError("invalid_argument", `Unknown output format: ${opts.format}`, {
      action: "Use --format json or --format text",
    });
  }
  const mode = detectMode({ json: opts.json, format: opts.format });
  if (mode.agent) {
    json(data);
    return;
  }
  renderHuman(data);
}

export function table(rows: Record<string, string>[], columns?: string[]): void {
  if (rows.length === 0) {
    console.log("No results.");
    return;
  }
  const cols = columns ?? Object.keys(rows[0]!);
  const widths = cols.map(col => Math.max(col.length, ...rows.map(r => (r[col] ?? "").length)));

  const header = cols.map((c, i) => c.padEnd(widths[i]!)).join("  ");
  console.log(header);
  console.log(widths.map(w => "─".repeat(w)).join("  "));
  for (const row of rows) {
    console.log(cols.map((c, i) => (row[c] ?? "").padEnd(widths[i]!)).join("  "));
  }
}
