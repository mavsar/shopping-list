export function cn(...classNames: Array<string | undefined | null | false>): string {
  return classNames.filter(Boolean).join(" ");
}
