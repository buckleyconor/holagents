/**
 * Shared rule helpers.
 * Configured headings carry their markdown prefix ("## Summary"); scanner
 * heading text is bare ("Summary"). Compare on the bare form.
 */
export function bareHeading(configured: string): string {
  return configured.replace(/^#+\s*/u, '').trim();
}
