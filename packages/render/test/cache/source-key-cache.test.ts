import { expect, it, vi } from "vitest";
import {
  createEffect,
  createLayer,
  createPage,
  createProject,
  createSpatialLayer,
  createSpatialScene,
  EditorEngine,
} from "@musart/core";
import type { Asset, Composition, Layer } from "@musart/core";
import { createSourceKeys } from "../../src/cache/keys";
import { SourceKeyCache } from "../../src/cache/source-key-cache";

function fixture(layers: Layer[], assets: Record<string, Asset> = {}) {
  const engine = new EditorEngine(
    createProject({ assets, pages: [createPage({ id: "page", layers })] }),
  );
  return { engine, page: () => engine.getSnapshot().project.pages[0]! };
}
function keys(page: Composition, cache?: SourceKeyCache, assets: Record<string, Asset> = {}) {
  const resolve = createSourceKeys(page, assets, 1, { cache });
  return page.layers.map(resolve);
}

it("reuses unchanged certified sources and transform-only clones without serializing signatures", () => {
  const f = fixture([createLayer("text", { id: "a" }), createLayer("text", { id: "b" })]);
  const cache = new SourceKeyCache();
  const first = keys(f.page(), cache);
  const stringify = vi.spyOn(JSON, "stringify");
  expect(keys(f.page(), cache)).toEqual(first);
  expect(stringify).not.toHaveBeenCalled();
  stringify.mockRestore();
  f.engine.execute({
    type: "updateLayers",
    ids: ["a"],
    patch: { x: 91, rotation: 37, opacity: 0.4 },
  });
  const after = vi.spyOn(JSON, "stringify");
  expect(keys(f.page(), cache)).toEqual(first);
  expect(after).not.toHaveBeenCalled();
  after.mockRestore();
  expect(cache.stats()).toMatchObject({ hits: 4, misses: 2, dependencyVectors: 2 });
});

it("invalidates paints/effects, retains siblings and restores exact source identity on undo/redo", () => {
  const f = fixture([createLayer("text", { id: "a" }), createLayer("text", { id: "b" })]);
  const cache = new SourceKeyCache();
  const initial = keys(f.page(), cache);
  f.engine.execute({
    type: "updateLayers",
    ids: ["a"],
    patch: { fill: "#ff0000", effects: [createEffect("blur")] },
  });
  const edited = keys(f.page(), cache);
  expect(edited).toEqual(keys(f.page()));
  expect(edited[0]).not.toBe(initial[0]);
  expect(edited[1]).toBe(initial[1]);
  f.engine.undo();
  expect(keys(f.page(), cache)).toEqual(initial);
  f.engine.redo();
  expect(keys(f.page(), cache)).toEqual(edited);
});

it("includes ordered child placement, parent structure and source changes", () => {
  const cache = new SourceKeyCache();
  const group = createLayer("group", { id: "group" });
  const a = createLayer("text", { id: "a", parentId: group.id });
  const b = createLayer("text", { id: "b", parentId: group.id, fill: "#ff0000" });
  const original = fixture([group, a, b]);
  const before = keys(original.page(), cache);
  for (const layers of [
    [group, { ...a, x: 33 }, b],
    [group, { ...a, affine: [1, 0.5, 0, 1] as Layer["affine"] }, b],
    [group, { ...a, opacity: 0.2 }, b],
    [group, b, a],
    [group, { ...a, parentId: null }, b],
    [group, { ...a, fill: "#00ff00" }, b],
  ]) {
    const page = fixture(layers).page();
    const result = keys(page, cache);
    expect(result).toEqual(keys(page));
    expect(result[0]).not.toBe(before[0]);
  }
});

it("tracks mask world mapping, source visibility/ancestor opacity and referenced content", () => {
  const group = createLayer("group", { id: "g" });
  const mask = createLayer("text", { id: "mask", parentId: group.id, maskSource: true });
  const target = createLayer("text", {
    id: "target",
    mask: { enabled: true, inverted: false, layerId: mask.id },
  });
  const cache = new SourceKeyCache();
  const original = fixture([group, mask, target]);
  const before = keys(original.page(), cache)[2];
  for (const layers of [
    [{ ...group, opacity: 0.3 }, mask, target],
    [{ ...group, visible: false }, mask, target],
    [{ ...group, x: 33 }, mask, target],
    [group, { ...mask, fill: "#ff0000" }, target],
    [group, mask, { ...target, x: 23 }],
  ]) {
    const page = fixture(layers).page();
    const result = keys(page, cache);
    expect(result).toEqual(keys(page));
    expect(result[2]).not.toBe(before);
  }
});

it("tracks original replacement, media stamps and spatial scene/stamp dependencies", () => {
  const cache = new SourceKeyCache();
  const image = createLayer("image", { id: "image", assetId: "original" });
  const asset: Asset = {
    id: "original",
    name: "original",
    mime: "image/png",
    width: 1,
    height: 1,
    dataUrl: "data:image/png;base64,AAAA",
  };
  const f = fixture([image], { original: asset });
  const first = keys(f.page(), cache, { original: asset });
  asset.dataUrl = "two";
  expect(keys(f.page(), cache, { original: asset })).not.toEqual(first);
  const video = fixture([createLayer("video", { id: "video-layer", assetId: "video" })], {
    video: {
      id: "video",
      kind: "video",
      name: "Video",
      mime: "video/mp4",
      width: 32,
      height: 16,
      originalId: "original-video",
      contentRevision: "revision-1",
      byteLength: 9,
      duration: { value: 5, rate: 1 },
      firstTimestamp: { value: 0, rate: 1 },
      timeResolution: 30000,
      orientation: { rotation: 0, flip: false, pixelAspectRatio: { numerator: 1, denominator: 1 } },
    },
  }).page();
  const videoKey = (stamp: string) =>
    createSourceKeys(video, {}, 1, { cache, videoStamp: () => stamp })(video.layers[0]!);
  expect(videoKey("pts:1")).not.toBe(videoKey("pts:2"));
  const page = new EditorEngine(
    createProject({
      pages: [
        createPage({
          id: "spatial",
          spatial: createSpatialScene(),
          layers: [createLayer("text", { id: "spatial-layer", spatial: createSpatialLayer() })],
        }),
      ],
    }),
  ).getSnapshot().project.pages[0]!;
  const spatialKey = (stamp: string) =>
    createSourceKeys(page, {}, 1, { cache, spatialStamp: () => stamp })(page.layers[0]!);
  expect(spatialKey("capture:1")).not.toBe(spatialKey("capture:2"));
});

it("keeps uncertified and foreign mutable objects conservative, including shallow frozen pages", () => {
  const cache = new SourceKeyCache();
  const layer = createLayer("text", { effects: [createEffect("blur")] });
  const page = Object.freeze(createPage({ layers: Object.freeze([layer]) as unknown as Layer[] }));
  const before = keys(page, cache);
  layer.effects[0]!.amount = 0.42;
  expect(keys(page, cache)).not.toEqual(before);
  expect(cache.stats().entries).toBe(0);
  const certified = fixture([createLayer("text", { id: "foreign" })]).page();
  const foreign = { ...certified.layers[0]! };
  createSourceKeys(certified, {}, 1, { cache })(foreign);
  expect(cache.stats().entries).toBe(0);
});

it("admits an explicit immutable frame owner only for its exact page", () => {
  const original = fixture([createLayer("text", { id: "a" })]).page();
  const page = { ...original, layers: original.layers.map((layer) => ({ ...layer, x: 33 })) };
  const cache = new SourceKeyCache();
  createSourceKeys(page, {}, 1, { cache, immutableFrame: { page: original } })(page.layers[0]!);
  expect(cache.stats().entries).toBe(0);
  const owner = { page };
  const first = createSourceKeys(page, {}, 1, { cache, immutableFrame: owner })(page.layers[0]!);
  const next = { ...page, layers: page.layers.map((layer) => ({ ...layer, x: 77 })) };
  const stringify = vi.spyOn(JSON, "stringify");
  expect(
    createSourceKeys(next, {}, 1, { cache, immutableFrame: { page: next } })(next.layers[0]!),
  ).toBe(first);
  expect(stringify).not.toHaveBeenCalled();
  stringify.mockRestore();
});

it("bypasses repeated structural clone misses and lets a new stable scene warm up", () => {
  const layers = Array.from({ length: 16 }, (_, index) =>
    createLayer("text", { id: `text-${index}` }),
  );
  const before = fixture(layers).page(),
    after = fixture(layers).page();
  const cache = new SourceKeyCache();
  const initial = keys(before, cache);
  const stringify = vi.spyOn(JSON, "stringify");
  expect(keys(after, cache)).toEqual(initial);
  expect(stringify).toHaveBeenCalledTimes(layers.length);
  stringify.mockRestore();
  expect(cache.stats().bypassedJobs).toBe(1);
  keys(after, cache);
  const warm = vi.spyOn(JSON, "stringify");
  expect(keys(after, cache)).toEqual(initial);
  expect(warm).not.toHaveBeenCalled();
  warm.mockRestore();
});

it("bounds retained scalar payloads and entries, clears explicitly and never caches a failed traversal", () => {
  const cache = new SourceKeyCache(2, 1024);
  const layer = createLayer("text");
  let next = 0;
  const key = (id: string, dependency: string) =>
    cache.resolve(
      id,
      layer,
      (emit) => emit(dependency),
      () => `key:${++next}`,
    );
  expect(key("a", "same")).toBe(key("a", "same"));
  key("b", "other");
  key("c", "other");
  expect(cache.stats().entries).toBe(2);
  const original = key("a", "same");
  key("oversized", "x".repeat(1024));
  expect(cache.stats().retainedPayloadBytes).toBeLessThanOrEqual(1024);
  expect(key("a", "same")).toBe(original);
  expect(() =>
    cache.resolve(
      "failed",
      layer,
      () => {
        throw Error("dependency failed");
      },
      () => "unused",
    ),
  ).toThrow("dependency failed");
  expect(key("failed", "now ready")).toMatch(/^key:/);
  cache.clear();
  expect(cache.stats()).toMatchObject({ entries: 0, retainedPayloadBytes: 0 });
  expect(() => new SourceKeyCache(0)).toThrow(RangeError);
});

it("accounts recursive child eviction while a parent dependency entry is being compared", () => {
  const cache = new SourceKeyCache(1, 1024);
  const layer = createLayer("text");
  const parent = (withChild: boolean, dependency: number) =>
    cache.resolve(
      "parent",
      layer,
      (emit) => {
        emit(dependency);
        if (withChild)
          cache.resolve(
            "child",
            layer,
            (child) => child(1),
            () => "child-token",
          );
      },
      () => `parent-${dependency}`,
    );
  parent(false, 1);
  const bytes = cache.stats().retainedPayloadBytes;
  expect(parent(true, 1)).toBe("parent-1");
  expect(cache.stats()).toMatchObject({ entries: 1, retainedPayloadBytes: bytes });
  expect(parent(true, 2)).toBe("parent-2");
  expect(cache.stats()).toMatchObject({ entries: 1, retainedPayloadBytes: bytes });
});
