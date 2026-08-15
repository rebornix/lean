export function indent(text: string, spaces = 2): string {
  const prefix = " ".repeat(spaces);
  return text
    .split("\n")
    .map(line => (line.length === 0 ? line : prefix + line))
    .join("\n");
}
