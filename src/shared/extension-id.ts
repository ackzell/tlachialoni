/**
 * Chrome Web Store identifier recognition, shared by the command palette (which
 * offers an install row while you type) and the main-process installer.
 * Pure module (no Electron imports) so it is unit-testable.
 */

/** A raw extension ID: 32 characters in the `a`–`p` alphabet. */
const EXTENSION_ID = /^[a-p]{32}$/;

/** Hosts that serve Chrome Web Store detail pages. */
const STORE_HOSTS = new Set([
  "chromewebstore.google.com",
  "chrome.google.com",
  "chromewebstore.googleusercontent.com",
]);

/**
 * Resolves palette input to a 32-character extension ID. Accepts a raw ID or a
 * Chrome Web Store URL (the ID is the last `[a-p]{32}` path segment). Returns
 * null for anything else.
 */
export function parseExtensionId(input: string): string | null {
  const raw = input.trim();
  if (EXTENSION_ID.test(raw)) return raw;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (!STORE_HOSTS.has(url.hostname.toLowerCase())) return null;

  const segments = url.pathname.split("/").filter(Boolean);
  for (let i = segments.length - 1; i >= 0; i--) {
    const segment = segments[i];
    if (EXTENSION_ID.test(segment)) return segment;
  }
  return null;
}
