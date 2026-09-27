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

/**
 * Splits a display label into reveal units for the strip's staggered entrance.
 * `:` and `/` separate units and stay attached to the word they follow, so
 * concatenating the units reproduces the label exactly; a leading separator
 * becomes its own unit. Presentation only — never used for navigation.
 */
export function splitTargetLabel(label: string): string[] {
  const parts = label.split(/([:/]+)/u).filter((part) => part.length > 0);
  const units: string[] = [];
  for (const part of parts) {
    if (/^[:/]+$/u.test(part) && units.length > 0) {
      units[units.length - 1] += part;
    } else {
      units.push(part);
    }
  }
  return units.length > 0 ? units : [label];
}
