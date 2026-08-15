/** Parse a whole-number string, returning undefined for anything else. */
export function parseIntStrict(text: string): number | undefined {
  const trimmed = text.trim();
  return /^-?\d+$/.test(trimmed) ? Number(trimmed) : undefined;
}
