/**
 * Local-target policy: which addresses the tool is allowed to load.
 * Pure module (no Electron imports) so it is unit-testable.
 */

export interface TargetResolution {
  ok: boolean;
  url?: string;
  reason?: string;
}

function isPrivateIpv4(host: string): boolean {
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (a === 127) return true; // loopback
  if (a === 10) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  return false;
}

/** True for loopback, private network ranges, and dev hostnames. */
export function isLocalHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host === "::1") return true;
  if (host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".test")) {
    return true;
  }
  return isPrivateIpv4(host);
}

function finalize(candidate: string): TargetResolution {
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return { ok: false, reason: "That does not look like a URL" };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, reason: "Only http and https are supported" };
  }
  if (!isLocalHostname(url.hostname)) {
    return {
      ok: false,
      reason: "Only local addresses are allowed (localhost, private network, .local/.test)",
    };
  }
  return { ok: true, url: url.toString() };
}

/**
 * Normalizes palette input into an allowed absolute URL.
 * Accepts `:5173`, `5173`, `localhost:5173`, or a full http(s) URL.
 */
export function normalizeTarget(raw: string): TargetResolution {
  const input = raw.trim();
  if (!input) return { ok: false, reason: "Enter a target" };

  if (input.startsWith(":")) {
    const port = input.slice(1);
    return /^\d{1,5}$/.test(port)
      ? finalize(`http://localhost:${port}`)
      : { ok: false, reason: "Enter a port like :5173" };
  }

  if (/^\d{1,5}$/.test(input)) {
    return finalize(`http://localhost:${input}`);
  }

  const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(input);
  return finalize(hasScheme ? input : `http://${input}`);
}

/** True when two URLs share a scheme, host, and port. Unparseable input is never same-origin. */
export function sameOrigin(a: string, b: string): boolean {
  try {
    return new URL(a).origin === new URL(b).origin;
  } catch {
    return false;
  }
}

/**
 * Whether a target load should raise the loading veil. The veil is a "switching
 * sites" indicator, not a per-load one: Chromium keeps the painted page on screen
 * until the next document commits, so a same-origin path change needs no cover.
 * A site switch, a cold start (nothing painted yet), or a load from the failure
 * view still does.
 */
export function shouldVeilTarget(options: {
  shownUrl: string | null;
  nextUrl: string;
  failed: boolean;
}): boolean {
  if (options.failed || !options.shownUrl) return true;
  return !sameOrigin(options.shownUrl, options.nextUrl);
}

/** True when an already-normalized URL is still allowed (used to guard navigation). */
export function isAllowedUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
    return isLocalHostname(parsed.hostname);
  } catch {
    return false;
  }
}
