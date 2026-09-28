/**
 * Release metadata helpers.
 *
 * Pure module (no Electron imports) so it is unit-testable. The build injects the
 * release date as a `YYYY-MM-DD` string; this module only renders it for display.
 */

/**
 * Formats an ISO `YYYY-MM-DD` release date as a long, human-readable date, e.g.
 * `2026-09-28` → `September 28, 2026`. Anything that is not a parseable ISO date
 * is returned unchanged so a bad value still renders instead of throwing.
 */
export function formatReleaseDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return iso;
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}
