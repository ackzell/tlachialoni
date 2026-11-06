/**
 * Failure vocabulary shared by the main-frame failure surface and the frame
 * notice (specs/001, specs/028).
 *
 * Chromium reports a load failure as a negative net error code plus its own
 * description. The description is accurate but written for a Chromium log, so
 * both surfaces translate the common cases and keep the description as the
 * fallback (FR-005, FR-006).
 */

/** Which response-header policy refused to let this page frame the address. */
export type FramingPolicy = "frame-ancestors" | "x-frame-options";

/** `net::ERR_ABORTED` — a cancelled navigation, which is not a failure. */
const ERR_ABORTED = -3;

/** `net::ERR_BLOCKED_BY_RESPONSE` — response headers refused the load. */
const ERR_BLOCKED_BY_RESPONSE = -27;

/** A cancelled navigation reports nothing; code 0 is Electron's "no error". */
export function isIgnorableFailure(errorCode: number): boolean {
  return errorCode === ERR_ABORTED || errorCode === 0;
}

/**
 * Whether the response headers refused the load. For a subframe this is almost
 * always a framing policy, which is why the notice treats it specially.
 */
export function isResponseBlocked(errorCode: number): boolean {
  return errorCode === ERR_BLOCKED_BY_RESPONSE;
}

/** Maps Chromium net error codes to a short human-readable reason. */
export function failureReason(errorCode: number, errorDescription: string): string {
  switch (errorCode) {
    case -102:
      return "Connection refused";
    case -105:
      return "Name could not be resolved";
    case -106:
      return "The network is offline";
    case -118:
      return "The connection timed out";
    case ERR_BLOCKED_BY_RESPONSE:
      return "The response headers blocked the load";
    default:
      return errorDescription || `Load failed (${errorCode})`;
  }
}

/**
 * The reason for a failed frame. When a framing policy refused it, the reason
 * names the policy family rather than leaving the developer to guess why a
 * perfectly healthy site will not appear (FR-004).
 */
export function frameFailureReason(
  errorCode: number,
  errorDescription: string,
  policy: FramingPolicy | null,
): string {
  if (policy === "frame-ancestors") {
    return "Blocked by the framed site's Content-Security-Policy frame-ancestors directive";
  }
  if (policy === "x-frame-options") {
    return "Blocked by the framed site's X-Frame-Options header";
  }
  if (isResponseBlocked(errorCode)) {
    return "Blocked by the framed site's response headers";
  }
  return failureReason(errorCode, errorDescription);
}

/**
 * Chromium logs a refused frame to the page console before the frame load
 * failure is reported. Reading the directive from that line lets the notice name
 * the policy family instead of guessing (FR-004).
 */
export function framingPolicyInConsole(message: string): FramingPolicy | null {
  if (message.includes("frame-ancestors")) return "frame-ancestors";
  if (message.includes("X-Frame-Options")) return "x-frame-options";
  return null;
}

/**
 * The address a refusal message names. Chromium quotes it, so the first quoted
 * span is the framed address.
 */
export function framedUrlInConsole(message: string): string | null {
  const quoted = /['"]([^'"]+)['"]/.exec(message);
  return quoted?.[1] ?? null;
}
