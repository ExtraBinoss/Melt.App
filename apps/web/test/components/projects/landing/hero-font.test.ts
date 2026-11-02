import { beforeEach, expect, test, vi } from "vitest";
import { messages } from "../../../../src/components/projects/landing/messages";
import { brand } from "../../../../src/ui/brand/config";
import metadata from "../../../../src/components/projects/landing/hero/font-curves/manifest.json";

const runtime = vi.hoisted(() => ({ acquire: vi.fn(), reset: vi.fn() }));
vi.mock("text-shaper", () => ({
  Font: { loadAsync: runtime.acquire },
  Face: class {
    normalizedCoords = [];
  },
  UnicodeBuffer: class {
    codepoints = [65];
    clusters: number[] = [];
    addStr() {
      return this;
    }
    setScript() {
      return this;
    }
  },
  shape: () => ({
    length: 1,
    infos: [{ cluster: 0, glyphId: 3 }],
    positions: [{ xOffset: 0, yOffset: 0 }],
    reset: runtime.reset,
  }),
  getGlyphPathWithVariation: () => ({
    commands: [
      { type: "M", x: 0, y: 0 },
      { type: "L", x: 40, y: 80 },
    ],
  }),
}));
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

test("all localized UI runs use matching cached outlines or declared native-script fallback without fetching a font", async () => {
  const fetch = vi
    .spyOn(globalThis, "fetch")
    .mockRejectedValue(
      new Error(
        "Font parsing must stay off the startup path. Regenerate with bun scripts/brand/hero-font.ts.",
      ),
    );
  try {
    const { loadHeroOutlines } =
      await import("../../../../src/components/projects/landing/hero/font-outlines");
    expect(metadata.source).toBe(brand.typeface.source);
    expect(metadata.sha256).toMatch(/^[a-f0-9]{64}$/);
    for (const [locale, value] of Object.entries(messages)) {
      const copy = value as { titleFirst: string; titleSecond: string; end: string };
      for (const [texts, weight] of [
        [[copy.titleFirst, copy.titleSecond], 700],
        [[copy.end], 650],
      ] as const) {
        const result = await loadHeroOutlines([...texts], weight, new AbortController().signal);
        if (["ar", "ja", "ko", "zh"].includes(locale)) expect(result).toBeUndefined();
        else {
          expect(result?.runs).toHaveLength(texts.length);
          for (const run of result!.runs) {
            expect(run.length).toBeGreaterThan(0);
            for (const glyph of run) expect(glyph.commands.length).toBeGreaterThan(0);
          }
        }
      }
    }
    expect(fetch).not.toHaveBeenCalled();
    expect(runtime.acquire).not.toHaveBeenCalled();
  } finally {
    fetch.mockRestore();
  }
});

test("unknown text still loads the original parser and releases shaping buffers", async () => {
  const fetch = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(new Response(new Uint8Array([1, 2, 3])));
  runtime.acquire.mockResolvedValue({ unitsPerEm: 1000, glyphIdForChar: () => 3 });
  try {
    const { loadHeroOutlines } =
      await import("../../../../src/components/projects/landing/hero/font-outlines");
    const result = await loadHeroOutlines(
      ["A different headline"],
      700,
      new AbortController().signal,
    );
    expect(result?.runs[0]?.[0]?.commands).toHaveLength(2);
    expect(fetch).toHaveBeenCalledWith(brand.typeface.source);
    expect(runtime.reset).toHaveBeenCalledOnce();
  } finally {
    fetch.mockRestore();
  }
});

test("failed runtime acquisition rejects honestly and an aborted owner cannot consume even cached geometry", async () => {
  const fetch = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(new Response(null, { status: 503 }));
  try {
    const { loadHeroOutlines } =
      await import("../../../../src/components/projects/landing/hero/font-outlines");
    await expect(
      loadHeroOutlines(["Another uncached heading"], 700, new AbortController().signal),
    ).rejects.toThrow("503");
    const controller = new AbortController();
    controller.abort();
    await expect(
      loadHeroOutlines([messages.en.titleFirst], 700, controller.signal),
    ).rejects.toThrow();
  } finally {
    fetch.mockRestore();
  }
});
