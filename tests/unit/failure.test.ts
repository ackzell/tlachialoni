import { describe, expect, it } from "vitest";
import {
  failureReason,
  framedUrlInConsole,
  frameFailureReason,
  framingPolicyInConsole,
  isIgnorableFailure,
  isResponseBlocked,
} from "../../src/shared/failure";

describe("isIgnorableFailure", () => {
  it("ignores cancelled navigations and the no-error code", () => {
    expect(isIgnorableFailure(-3)).toBe(true);
    expect(isIgnorableFailure(0)).toBe(true);
  });

  it("keeps real failures", () => {
    expect(isIgnorableFailure(-102)).toBe(false);
    expect(isIgnorableFailure(-27)).toBe(false);
  });
});

describe("isResponseBlocked", () => {
  it("recognises the blocked-by-response code", () => {
    expect(isResponseBlocked(-27)).toBe(true);
  });

  it("does not treat a refused connection as a response block", () => {
    expect(isResponseBlocked(-102)).toBe(false);
  });
});

describe("failureReason", () => {
  it("names the common network failures", () => {
    expect(failureReason(-102, "ERR_CONNECTION_REFUSED")).toBe("Connection refused");
    expect(failureReason(-105, "ERR_NAME_NOT_RESOLVED")).toBe("Name could not be resolved");
    expect(failureReason(-106, "ERR_INTERNET_DISCONNECTED")).toBe("The network is offline");
    expect(failureReason(-118, "ERR_CONNECTION_TIMED_OUT")).toBe("The connection timed out");
  });

  it("keeps Chromium's description for an unknown code", () => {
    expect(failureReason(-324, "ERR_EMPTY_RESPONSE")).toBe("ERR_EMPTY_RESPONSE");
  });

  it("still produces a reason when Chromium supplies none", () => {
    expect(failureReason(-999, "")).toBe("Load failed (-999)");
  });
});

describe("frameFailureReason", () => {
  it("names the CSP directive when one was seen", () => {
    expect(frameFailureReason(-27, "ERR_BLOCKED_BY_RESPONSE", "frame-ancestors")).toContain(
      "frame-ancestors",
    );
  });

  it("names X-Frame-Options when that was the policy", () => {
    expect(frameFailureReason(-27, "ERR_BLOCKED_BY_RESPONSE", "x-frame-options")).toContain(
      "X-Frame-Options",
    );
  });

  it("still says the response headers blocked the frame when the policy is unknown", () => {
    const reason = frameFailureReason(-27, "ERR_BLOCKED_BY_RESPONSE", null);
    expect(reason).toContain("response headers");
  });

  it("falls back to the shared vocabulary for other frame failures", () => {
    expect(frameFailureReason(-102, "ERR_CONNECTION_REFUSED", null)).toBe("Connection refused");
    expect(frameFailureReason(-105, "ERR_NAME_NOT_RESOLVED", null)).toBe(
      "Name could not be resolved",
    );
  });
});

describe("framingPolicyInConsole", () => {
  it("reads the CSP directive family", () => {
    const message =
      "Framing 'https://example.dev/' violates the following Content Security Policy directive: \"frame-ancestors 'self' https://ackzell.dev\". The request has been blocked.";
    expect(framingPolicyInConsole(message)).toBe("frame-ancestors");
  });

  it("reads the X-Frame-Options family", () => {
    const message =
      "Refused to display 'https://example.dev/' in a frame because it set 'X-Frame-Options' to 'deny'.";
    expect(framingPolicyInConsole(message)).toBe("x-frame-options");
  });

  it("ignores unrelated console lines", () => {
    expect(framingPolicyInConsole("Failed to load resource: net::ERR_FAILED")).toBeNull();
  });
});

describe("framedUrlInConsole", () => {
  it("takes the address Chromium quoted", () => {
    const message =
      "Framing 'https://example.dev/' violates the following Content Security Policy directive: \"frame-ancestors 'self'\".";
    expect(framedUrlInConsole(message)).toBe("https://example.dev/");
  });

  it("returns null when no address is quoted", () => {
    expect(framedUrlInConsole("Something went wrong")).toBeNull();
  });
});
