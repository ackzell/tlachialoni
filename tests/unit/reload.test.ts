import { describe, expect, it } from "vitest";
import { isReloadNavigation, rimKindFor } from "../../src/shared/reload";

describe("isReloadNavigation", () => {
  it("is false before a document has been committed", () => {
    expect(isReloadNavigation("http://localhost:3000/", null)).toBe(false);
  });

  it("is true when the target is the committed document", () => {
    expect(isReloadNavigation("http://localhost:3000/", "http://localhost:3000/")).toBe(true);
  });

  it("normalizes a trailing slash and default port", () => {
    expect(isReloadNavigation("http://localhost:3000", "http://localhost:3000/")).toBe(true);
  });

  it("is false for another path, query, or origin", () => {
    expect(isReloadNavigation("http://localhost:3000/guide", "http://localhost:3000/")).toBe(false);
    expect(isReloadNavigation("http://localhost:3000/?tab=1", "http://localhost:3000/")).toBe(
      false,
    );
    expect(isReloadNavigation("http://127.0.0.1:3000/", "http://localhost:3000/")).toBe(false);
  });

  it("falls back to string equality for unparseable input", () => {
    expect(isReloadNavigation("not a url", "not a url")).toBe(true);
    expect(isReloadNavigation("not a url", "different")).toBe(false);
  });
});

describe("rimKindFor", () => {
  it("is normal for a fresh in-place navigation", () => {
    expect(rimKindFor(false, null, null)).toBe("normal");
  });

  it("is normal for a page-initiated reload with no command", () => {
    expect(rimKindFor(true, null, null)).toBe("normal");
  });

  it("uses the pending reload command's kind", () => {
    expect(rimKindFor(true, "normal", null)).toBe("normal");
    expect(rimKindFor(true, "hard", null)).toBe("hard");
  });

  it("lets a hard rim survive a redirect or follow-up navigation", () => {
    expect(rimKindFor(false, null, "hard")).toBe("hard");
    expect(rimKindFor(true, null, "hard")).toBe("hard");
  });

  it("downgrades to normal when a new normal reload starts", () => {
    expect(rimKindFor(true, "normal", "hard")).toBe("normal");
  });

  it("ignores a stale pending kind on a non-reload navigation", () => {
    expect(rimKindFor(false, "hard", null)).toBe("normal");
  });
});
