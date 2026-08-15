/** Ellipsis appended when a string is cut for display. */
const ELLIPSIS = "…";

/**
 * Truncate `text` to at most `maxLength` characters for table display.
 *
 * When content is cut, the result ends with a single ellipsis character and
 * still fits within `maxLength`. Counting is done per Unicode code point so
 * emoji and other astral-plane characters are never split in half.
 */
export function truncate(text: string, maxLength: number): string {
  if (maxLength <= 0) {
    return "";
  }
  const chars = Array.from(text);
  if (chars.length <= maxLength) {
    return text;
  }
  if (maxLength === 1) {
    return ELLIPSIS;
  }
  const head = chars
    .slice(0, maxLength - 1)
    .join("")
    .trimEnd();
  return head + ELLIPSIS;
}
