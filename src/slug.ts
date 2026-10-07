/** Canonical username: lowercase letters, digits, and underscores. */
export function toSlug(input: string): string {
  return input.toLowerCase().replace(/^@/, "").replace(/[^a-z0-9_]/g, "");
}

export function isValidSlug(slug: string): boolean {
  return slug.length > 0;
}
