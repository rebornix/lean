const LABELS: readonly string[] = ["None", "Urgent", "High", "Medium", "Low"];

export function priorityLabel(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return "None";
  }
  const n = Math.floor(value);
  if (!Number.isFinite(n) || n < 0 || n > 4) {
    return "None";
  }
  return LABELS[n] ?? "None";
}
