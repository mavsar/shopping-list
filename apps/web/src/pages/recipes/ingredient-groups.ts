/**
 * Ingredients (and steps) are stored as plain lines; a short line ending with ":" is the
 * title of the group that follows, e.g. "Omaka:" or "Za preliv:".
 */
export function isGroupHeading(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.length > 1 && trimmed.length <= 80 && trimmed.endsWith(':');
}

/** "Omaka:" → "Omaka" */
export function groupHeadingLabel(line: string): string {
  return line.trim().replace(/\s*:+\s*$/, '');
}

/** "Omaka" → "Omaka:" */
export function toGroupHeading(label: string): string {
  return `${groupHeadingLabel(label)}:`;
}

/** Only real ingredients — what can be checked off or sent to a shopping list. */
export function ingredientLines(lines: string[]): string[] {
  return lines.filter((line) => line.trim() && !isGroupHeading(line));
}
