import { expect, it } from "vitest";
import { projectNameCandidate } from "../../src/document/naming";
it("preserves requested names and appends a space and positive increment", () => {
  expect(projectNameCandidate("Bloom", 0)).toBe("Bloom");
  expect(projectNameCandidate("Bloom", 1)).toBe("Bloom 1");
  expect(projectNameCandidate("Studio 2026", 12)).toBe("Studio 2026 12");
});
it("keeps suffixed names within the document limit without splitting a Unicode pair", () => {
  const name = "a".repeat(253) + "🌷";
  expect(projectNameCandidate(name, 1)).toBe("a".repeat(253) + " 1");
  expect(projectNameCandidate("a".repeat(256), 100)).toHaveLength(256);
});
it("rejects invalid names and increments", () => {
  for (const index of [-1, 0.5, Infinity, Number.MAX_SAFE_INTEGER + 1])
    expect(() => projectNameCandidate("Bloom", index)).toThrow(RangeError);
  expect(() => projectNameCandidate("", 0)).toThrow();
});
