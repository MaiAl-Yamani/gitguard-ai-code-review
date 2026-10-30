import { describe, expect, it } from "vitest";
import { parseReview, reviewToMarkdown } from "./review-schema";

describe("parseReview", () => {
  it("keeps line null when the model gives none", () => {
    const r = parseReview(JSON.stringify({ summary: "s", risk: "low", issues: [{ title: "t", severity: "high", file: "a.js", line: null, explanation: "e", fix: null }], tests: [] }));
    expect(r.issues[0]?.line).toBeNull();
  });
  it("rejects non-positive or non-integer line numbers", () => {
    const r = parseReview(JSON.stringify({ summary: "s", issues: [{ title: "t", severity: "low", line: "12", explanation: "e" }] }));
    expect(r.issues[0]?.line).toBeNull();
  });
  it("raises risk to the worst issue severity", () => {
    const r = parseReview(JSON.stringify({ summary: "s", risk: "low", issues: [{ title: "t", severity: "critical", explanation: "e" }] }));
    expect(r.risk).toBe("critical");
  });
  it("skips empty issues and warns", () => {
    const r = parseReview(JSON.stringify({ summary: "s", issues: [{}, { title: "ok", severity: "medium", explanation: "e" }] }));
    expect(r.issues).toHaveLength(1);
    expect(r.warnings.length).toBeGreaterThan(0);
  });
  it("throws on non-JSON text", () => {
    expect(() => parseReview("sorry, I can't")).toThrow();
  });
  it("markdown says location not identified when file missing", () => {
    const md = reviewToMarkdown(parseReview(JSON.stringify({ summary: "s", issues: [{ title: "t", severity: "low", explanation: "e" }] })));
    expect(md).toContain("Location not identified");
  });
});
