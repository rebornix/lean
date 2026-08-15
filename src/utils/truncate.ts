export function truncate(text: string, max: number): string {
  if (text.length <= max) {
    return text;
  }
  return max <= 1 ? text.slice(0, max) : `${text.slice(0, max - 1)}…`;
}
