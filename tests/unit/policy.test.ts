import { describe, expect, it } from "vitest";
import {
  isAllowedUrl,
  isLocalHostname,
  normalizeTarget,
  sameOrigin,
  shouldVeilTarget,
} from "../../src/main/nav/policy";

describe("normalizeTarget", () => {
  it("resolves the :port shorthand to localhost", () => {
    expect(normalizeTarget(":5173")).toEqual({ ok: true, url: "http://localhost:5173/" });
  });

  it("resolves a bare port to localhost", () => {
    expect(normalizeTarget("5173")).toEqual({ ok: true, url: "http://localhost:5173/" });
    expect(normalizeTarget("3000")).toEqual({ ok: true, url: "http://localhost:3000/" });
  });

  it("resolves host:port without a scheme", () => {
    expect(normalizeTarget("localhost:5173")).toEqual({ ok: true, url: "http://localhost:5173/" });
  });

  it("keeps full local http(s) URLs", () => {
    expect(normalizeTarget("http://localhost:3000")).toEqual({
      ok: true,
      url: "http://localhost:3000/",
    });
    expect(normalizeTarget("https://myapp.test")).toEqual({ ok: true, url: "https://myapp.test/" });
  });

  it("allows private network ranges and dev hostnames", () => {
    expect(normalizeTarget("192.168.1.5:3000").ok).toBe(true);
    expect(normalizeTarget("10.0.0.5").ok).toBe(true);
    expect(normalizeTarget("172.16.0.1").ok).toBe(true);
    expect(normalizeTarget("app.localhost").ok).toBe(true);
    expect(normalizeTarget("myapp.local").ok).toBe(true);
    expect(normalizeTarget("[::1]:5173").ok).toBe(true);
  });

  it("rejects public internet addresses", () => {
    expect(normalizeTarget("example.com")).toMatchObject({ ok: false });
    expect(normalizeTarget("https://8.8.8.8")).toMatchObject({ ok: false });
    expect(normalizeTarget("172.32.0.1")).toMatchObject({ ok: false });
  });

  it("rejects disallowed schemes", () => {
    expect(normalizeTarget("file:///etc/passwd")).toMatchObject({ ok: false });
    expect(normalizeTarget("javascript:alert(1)")).toMatchObject({ ok: false });
  });

  it("rejects empty and malformed input", () => {
    expect(normalizeTarget("   ")).toMatchObject({ ok: false });
    expect(normalizeTarget(":abc")).toMatchObject({ ok: false });
  });
});

describe("isLocalHostname", () => {
  it("accepts loopback and private hosts", () => {
    expect(isLocalHostname("localhost")).toBe(true);
    expect(isLocalHostname("127.0.0.1")).toBe(true);
    expect(isLocalHostname("[::1]")).toBe(true);
    expect(isLocalHostname("foo.test")).toBe(true);
  });

  it("rejects public hosts", () => {
    expect(isLocalHostname("github.com")).toBe(false);
    expect(isLocalHostname("1.1.1.1")).toBe(false);
  });
});

describe("isAllowedUrl", () => {
  it("guards navigation to local http(s) only", () => {
    expect(isAllowedUrl("http://localhost:3000/")).toBe(true);
    expect(isAllowedUrl("https://example.com/")).toBe(false);
    expect(isAllowedUrl("file:///tmp/x")).toBe(false);
    expect(isAllowedUrl("not a url")).toBe(false);
  });
});

describe("sameOrigin", () => {
  it("ignores path, query, and hash", () => {
    expect(sameOrigin("http://localhost:5173/a", "http://localhost:5173/b")).toBe(true);
    expect(sameOrigin("http://localhost:5173/a?x=1", "http://localhost:5173/a#top")).toBe(true);
    expect(sameOrigin("http://localhost:5173", "http://localhost:5173/")).toBe(true);
  });

  it("distinguishes port, scheme, and host", () => {
    expect(sameOrigin("http://localhost:5173/", "http://localhost:3000/")).toBe(false);
    expect(sameOrigin("http://localhost:5173/", "https://localhost:5173/")).toBe(false);
    expect(sameOrigin("http://localhost:5173/", "http://127.0.0.1:5173/")).toBe(false);
  });

  it("treats unparseable input as not same-origin", () => {
    expect(sameOrigin("not a url", "http://localhost:5173/")).toBe(false);
  });
});

describe("shouldVeilTarget", () => {
  it("skips the veil for a same-origin path change over a painted page", () => {
    expect(
      shouldVeilTarget({
        shownUrl: "http://localhost:5173/a",
        nextUrl: "http://localhost:5173/b",
        failed: false,
      }),
    ).toBe(false);
  });

  it("veils a site switch", () => {
    expect(
      shouldVeilTarget({
        shownUrl: "http://localhost:5173/",
        nextUrl: "http://localhost:3000/",
        failed: false,
      }),
    ).toBe(true);
  });

  it("always veils on a cold start", () => {
    expect(
      shouldVeilTarget({ shownUrl: null, nextUrl: "http://localhost:5173/", failed: false }),
    ).toBe(true);
  });

  it("always veils when the failure view is up", () => {
    expect(
      shouldVeilTarget({
        shownUrl: "http://localhost:5173/",
        nextUrl: "http://localhost:5173/",
        failed: true,
      }),
    ).toBe(true);
  });
});
