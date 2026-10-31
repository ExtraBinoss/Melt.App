import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { GlyphAtlasCache } from "../../../src/effects/ascii/cache";
import { installCanvasMock } from "../../canvas-fixture";
beforeEach(() => {
  installCanvasMock();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
test("custom glyphs are reused, LRU-evicted and disposed within a predictable byte bound", () => {
  const cache = new GlyphAtlasCache(2),
    a = cache.get("01"),
    b = cache.get("@");
  const first = vi.spyOn(a, "dispose"),
    second = vi.spyOn(b, "dispose");
  expect(cache.bytes()).toBe(3 * 1024);
  expect(cache.get("01")).toBe(a);
  expect(cache.projectedBytes(["abcdef"])).toBe(8 * 1024);
  const c = cache.get("abcdef");
  expect(second).toHaveBeenCalledOnce();
  expect(first).not.toHaveBeenCalled();
  expect(cache.bytes()).toBe(8 * 1024);
  expect(c.image.width).toBe(96);
  cache.dispose();
  expect(first).toHaveBeenCalledOnce();
  expect(cache.bytes()).toBe(0);
  cache.dispose();
  expect(first).toHaveBeenCalledOnce();
  expect(() => cache.get("")).toThrow();
  expect(() => cache.get("x".repeat(65))).toThrow();
});
