/**
 * Formats a target URL for shell chrome (strip, loading veil): host + path so
 * deep routes read clearly, plus whether the scheme is secure.
 */

export interface TargetDisplay {
  label: string;
  secure: boolean;
}

export function describeTarget(url: string | null | undefined): TargetDisplay {
  if (!url) return { label: "", secure: false };
  try {
    const parsed = new URL(url);
    const path = `${parsed.pathname}${parsed.search}`;
    const label = path && path !== "/" ? `${parsed.host}${path}` : parsed.host;
    return { label, secure: parsed.protocol === "https:" };
  } catch {
    return { label: url, secure: false };
  }
}
