import { expect, it } from "vitest";
import { createEffect, createLayer, createPage } from "@musart/core";
import { estimatePreviewCost } from "../../src/compositing/preview-cost";
it("budgets SVG coverage samples only for scalable preview sources, including transformed groups and mask references", () => {
  const vector = createLayer("vector", { id: "svg", x: 0, y: 0, width: 40, height: 30 }),
    page = createPage({ width: 64, height: 64, layers: [vector] });
  expect(estimatePreviewCost(page, 2, {}, true).bytes - estimatePreviewCost(page, 2).bytes).toBe(
    80 * 60 * 4 * 4,
  );
  const group = createLayer("group", { id: "group", x: 0, y: 0, width: 64, height: 64 }),
    grouped = { ...page, layers: [group, { ...vector, parentId: group.id }] };
  expect(
    estimatePreviewCost(grouped, 2, {}, true).bytes - estimatePreviewCost(grouped, 2).bytes,
  ).toBe(80 * 60 * 4 * 4);
  for (const layers of [
    [{ ...vector, effects: [createEffect("blur")] }],
    [
      { ...group, effects: [createEffect("blur")] },
      { ...vector, parentId: group.id },
    ],
    [
      { ...vector, maskSource: true },
      createLayer("rectangle", {
        width: 64,
        height: 64,
        mask: { enabled: true, inverted: false, layerId: vector.id },
      }),
    ],
  ]) {
    const fixed = { ...page, layers };
    expect(estimatePreviewCost(fixed, 2, {}, true)).toEqual(estimatePreviewCost(fixed, 2));
  }
});
it("counts real primitive batches instead of allocating each shape rectangle", () => {
  const page = createPage({
    width: 64,
    height: 64,
    layers: [createLayer("rectangle", { width: 32768, height: 1 })],
  });
  const result = estimatePreviewCost(page, 1);
  expect(result.maxDimension).toBe(64);
  expect(result.scaledBytes).toBe(64 * 64 * 4 * 3);
  expect(result.fixedBytes).toBeLessThan(1024);
});
it("clips transport groups using the same indexed viewport while preserving reference effects at1x", () => {
  const group = createLayer("group", { id: "group", x: 0, y: 0, width: 32768, height: 100 }),
    text = createLayer("text", { parentId: group.id, x: 0, y: 0, width: 32, height: 32 }),
    page = createPage({ width: 64, height: 64, layers: [group, text] });
  expect(estimatePreviewCost(page, 2).maxDimension).toBe(129);
  const fixed = createLayer("text", {
      id: "fx",
      width: 100,
      height: 60,
      effects: [createEffect("blur")],
    }),
    reference = createPage({ width: 200, height: 100, layers: [fixed] });
  const a = estimatePreviewCost(reference, 1),
    b = estimatePreviewCost(reference, 2);
  expect(a.fixedBytes).toBeGreaterThan(100 * 60 * 4 * 3);
  expect(a.fixedBytes).toBe(b.fixedBytes);
  expect(b.scaledBytes).toBe(a.scaledBytes * 4);
});
it("includes required mask sources and shares effect scratch instead of charging it per stack", () => {
  const mask = createLayer("text", {
      id: "mask",
      visible: true,
      maskSource: true,
      width: 256,
      height: 64,
    }),
    target = createLayer("rectangle", {
      id: "owner",
      width: 64,
      height: 64,
      mask: { enabled: true, layerId: mask.id, inverted: false },
    }),
    page = createPage({ width: 64, height: 64, layers: [mask, target] });
  expect(estimatePreviewCost(page, 1).fixedBytes).toBeGreaterThanOrEqual(256 * 64 * 4);
  const hidden = createPage({
    ...page,
    layers: [{ ...mask, visible: false, width: 8192, height: 8192 }, target],
  });
  expect(estimatePreviewCost(hidden, 1).maxDimension).toBe(64);
  const transparent = createPage({
    ...page,
    layers: [{ ...mask, opacity: 0, width: 8192, height: 8192 }, target],
  });
  expect(estimatePreviewCost(transparent, 1).maxDimension).toBe(64);
  const a = createLayer("text", {
      id: "a",
      width: 64,
      height: 64,
      effects: [createEffect("blur"), createEffect("invert")],
    }),
    b = { ...a, id: "b" },
    one = estimatePreviewCost(createPage({ width: 128, height: 128, layers: [a] }), 1),
    two = estimatePreviewCost(createPage({ width: 128, height: 128, layers: [a, b] }), 1);
  // Both 80×80 scratch/backdrop planes are shared; each layer owns its source, padded output and mips.
  expect(one.fixedBytes).toBe(64 * 64 * 4 + 80 * 80 * 4 * 4 + 34120);
  expect(two.fixedBytes - one.fixedBytes).toBe(one.fixedBytes - 80 * 80 * 8);
});
it("rejects invalid scales and counts original metadata dimensions without rasterizing them", () => {
  const image = createLayer("image", { assetId: "image", width: 10, height: 10 });
  const asset = {
    id: "image",
    width: 4096,
    height: 2048,
    mime: "image/png",
    dataUrl: "data:image/png;base64,",
    name: "image",
  } as const;
  const cost = estimatePreviewCost(createPage({ width: 20, height: 20, layers: [image] }), 1, {
    image: asset,
  });
  expect(cost.maxDimension).toBe(4096);
  expect(cost.originalBytes).toBe(4096 * 2048 * 4);
  expect(cost.fixedBytes).toBe(0);
  for (const invalid of [0, -1, NaN, Infinity])
    expect(() => estimatePreviewCost(createPage(), invalid)).toThrow("density");
});

it("counts independently timed video layers as separate source targets and three-slot upload rings", () => {
  const a = createLayer("video", { id: "clip-a", assetId: "shared", width: 128, height: 96 }),
    b = { ...a, id: "clip-b" };
  const asset = {
    id: "shared",
    kind: "video" as const,
    width: 128,
    height: 96,
    name: "Shared video",
    mime: "video/webm",
    originalId: "original",
    contentRevision: "1",
    byteLength: 1,
    duration: { value: 1, rate: 1 },
    firstTimestamp: { value: 0, rate: 1 },
    timeResolution: 1000,
    orientation: {
      rotation: 0 as const,
      flip: false,
      pixelAspectRatio: { numerator: 1, denominator: 1 },
    },
  };
  const one = estimatePreviewCost(createPage({ width: 128, height: 96, layers: [a] }), 1, {
    shared: asset,
  });
  const two = estimatePreviewCost(createPage({ width: 128, height: 96, layers: [a, b] }), 1, {
    shared: asset,
  });
  expect(one.originalBytes).toBe(128 * 96 * 4 * 4);
  expect(two.originalBytes).toBe(one.originalBytes * 2);
});

it("shares the same layer target when a painted layer also supplies a mask at the same density", () => {
  const source = createLayer("text", { id: "shared-mask", x: 0, y: 0, width: 128, height: 128 });
  const owner = createLayer("rectangle", {
    id: "masked",
    x: 0,
    y: 0,
    width: 64,
    height: 64,
    mask: { enabled: true, inverted: false, layerId: source.id },
  });
  const page = createPage({ width: 192, height: 192, layers: [source, owner] });
  const shared = estimatePreviewCost(page, 1);
  const maskOnly = estimatePreviewCost(
    { ...page, layers: [{ ...source, maskSource: true }, owner] },
    1,
  );
  expect(shared.bytes).toBe(maskOnly.bytes);
  expect(estimatePreviewCost(page, 2).bytes).toBeGreaterThan(
    estimatePreviewCost({ ...page, layers: [{ ...source, maskSource: true }, owner] }, 2).bytes,
  );
});

it("admits the media clipping surface only when image/video corners are rounded", () => {
  for (const kind of ["image", "video"] as const) {
    const layer = createLayer(kind, { width: 40, height: 30 });
    const square = createPage({ width: 100, height: 100, layers: [layer] });
    const rounded = { ...square, layers: [{ ...layer, radius: 12 }] };
    expect(estimatePreviewCost(rounded, 2).bytes - estimatePreviewCost(square, 2).bytes).toBe(
      80 * 60 * 4,
    );
  }
});

it("budgets final composition targets at preview density and clips effect padding to the artboard", () => {
  const page = createPage({ width: 120, height: 80 });
  const legacy = { ...page, effects: undefined };
  expect(estimatePreviewCost(page, 2)).toEqual(estimatePreviewCost(legacy, 2));
  for (const scale of [0.5, 1, 2]) {
    const plain = estimatePreviewCost(page, scale);
    const invert = estimatePreviewCost({ ...page, effects: [createEffect("invert")] }, scale);
    const blur = estimatePreviewCost({ ...page, effects: [createEffect("blur")] }, scale);
    const pixels = 120 * 80 * scale * scale;
    expect(invert.scaledBytes - plain.scaledBytes).toBe(pixels * 4 * 3);
    expect(invert.fixedBytes).toBe(plain.fixedBytes);
    // Blur owns one shared scratch plane; its first block needs no backdrop copy.
    expect(blur.scaledBytes - plain.scaledBytes).toBe(pixels * 4 * 4);
    expect(blur.maxDimension).toBe(Math.ceil(120 * scale));
    const laterBlur = estimatePreviewCost(
      { ...page, effects: [createEffect("invert"), createEffect("blur")] },
      scale,
    );
    expect(laterBlur.scaledBytes - plain.scaledBytes).toBe(pixels * 4 * 5);
  }
});

it("shares the effect working-set high water with fixed layer treatments rather than charging each stack", () => {
  const layer = createLayer("text", {
    width: 64,
    height: 64,
    effects: [createEffect("blur"), createEffect("invert")],
  });
  const page = createPage({ width: 80, height: 80, layers: [layer] });
  const baseline = estimatePreviewCost(page, 1);
  const effects = [createEffect("invert"), createEffect("blur")];
  const sameSize = estimatePreviewCost({ ...page, effects }, 1);
  // Both layer scratch/backdrop planes already cover the80×80 global working set.
  expect(sameSize.fixedBytes).toBe(baseline.fixedBytes);
  expect(sameSize.scaledBytes - baseline.scaledBytes).toBe(80 * 80 * 4 * 3);
  const larger = estimatePreviewCost({ ...page, effects }, 2);
  const ungraded = estimatePreviewCost(page, 2);
  expect(larger.fixedBytes).toBe(ungraded.fixedBytes);
  expect(larger.scaledBytes - ungraded.scaledBytes).toBe(
    160 * 160 * 4 * 3 + (160 * 160 - 80 * 80) * 4 * 2,
  );
});

it("counts actual global effect input dimensions once and ignores disabled uploads", () => {
  const asset = {
    id: "map",
    name: "Displacement map",
    width: 4096,
    height: 2048,
    mime: "image/png",
    dataUrl: "data:image/png;base64,",
  };
  const effects = [
    createEffect("displace", { inputs: { map: asset.id } }),
    createEffect("displace", { inputs: { map: asset.id } }),
  ];
  const page = createPage({ width: 120, height: 80, effects });
  const cost = estimatePreviewCost(page, 0.5, { map: asset });
  expect(cost.originalBytes).toBe(4096 * 2048 * 4);
  expect(cost.maxDimension).toBe(4096);
  const shared = estimatePreviewCost(
    { ...page, layers: [createLayer("image", { assetId: asset.id })] },
    0.5,
    { map: asset },
  );
  expect(shared.originalBytes).toBe(cost.originalBytes);
  const disabled = estimatePreviewCost(
    { ...page, effects: effects.map((effect) => ({ ...effect, enabled: false })) },
    0.5,
    { map: asset },
  );
  expect(disabled.originalBytes).toBe(0);
  expect(disabled.maxDimension).toBe(60);
  // The prepared image sampler still owns its actual1×1 neutral texture.
  expect(disabled.fixedBytes).toBe(4);
});

it("includes bounded shared glyph uploads and dormant compilation scratch", () => {
  const page = createPage({ width: 32, height: 24 });
  const first = createEffect("ascii", { settings: { characters: "@#" } });
  const shared = estimatePreviewCost({ ...page, effects: [first, { ...first, id: "second" }] }, 1);
  expect(shared.fixedBytes).toBe(2 * 16 * 16 * 4);
  const dormant = estimatePreviewCost(
    { ...page, effects: [createEffect("blur", { enabled: false })] },
    1,
  );
  expect(dormant.fixedBytes).toBe(4);
  expect(dormant.scaledBytes).toBe(estimatePreviewCost(page, 1).scaledBytes);
  const many = Array.from({ length: 12 }, (_, index) =>
    createEffect("ascii", { settings: { characters: "@".repeat(index + 1) } }),
  );
  const bounded = estimatePreviewCost({ ...page, effects: many }, 1);
  // Eight atlas cache slots bound all possible warmup/render reuse orders.
  expect(bounded.fixedBytes).toBe((5 + 6 + 7 + 8 + 9 + 10 + 11 + 12) * 16 * 16 * 4);
  expect(bounded.maxDimension).toBe(12 * 16);
});
