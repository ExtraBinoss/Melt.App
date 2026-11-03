import "@testing-library/jest-dom/vitest";
import "fake-indexeddb/auto";
import { webcrypto } from "node:crypto";
import { runInThisContext } from "node:vm";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";
// Match the native JSDOM pool's web APIs without replacing JSDOM's DOM constructors.
const nodeGlobals = runInThisContext("globalThis") as Record<string, unknown>;
for (const name of [
  "fetch",
  "Response",
  "Request",
  "Headers",
  "FormData",
  "ReadableStream",
  "WritableStream",
  "TransformStream",
  "ByteLengthQueuingStrategy",
  "TextEncoder",
  "TextDecoder",
  "structuredClone",
]) {
  if (!(name in globalThis) && name in nodeGlobals)
    Object.defineProperty(globalThis, name, {
      configurable: true,
      writable: true,
      value: nodeGlobals[name],
    });
}
// JSDOM's VM window has no SubtleCrypto; hashing tests use the real Node implementation.
if (!globalThis.crypto?.subtle)
  Object.defineProperty(globalThis, "crypto", { configurable: true, value: webcrypto });
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
class Observer {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = Observer;
// JSDOM has no layout engine; visibility-specific tests replace this visible-viewport fixture.
globalThis.IntersectionObserver = class implements IntersectionObserver {
  readonly root = null;
  readonly rootMargin = "0px";
  readonly scrollMargin = "0px";
  readonly thresholds = [0];
  constructor(private readonly callback: IntersectionObserverCallback) {}
  observe(target: Element) {
    const bounds = target.getBoundingClientRect();
    this.callback(
      [
        {
          target,
          isIntersecting: true,
          intersectionRatio: 1,
          time: performance.now(),
          boundingClientRect: bounds,
          intersectionRect: bounds,
          rootBounds: null,
        },
      ],
      this,
    );
  }
  unobserve() {}
  disconnect() {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
};
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});
if (!window.PointerEvent) window.PointerEvent = MouseEvent as typeof PointerEvent;
Element.prototype.scrollIntoView = vi.fn();
Element.prototype.hasPointerCapture = () => false;
Element.prototype.setPointerCapture = () => {};
Element.prototype.releasePointerCapture = () => {};

// Media transport is exercised in real browsers; JSDOM supplies no playback implementation.
HTMLMediaElement.prototype.play = vi.fn(async () => {});
HTMLMediaElement.prototype.pause = vi.fn();
HTMLMediaElement.prototype.load = vi.fn();
