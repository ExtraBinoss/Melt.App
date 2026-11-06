import { expect, it } from "vitest";
import { createEffect, createLayer, createPage } from "@musart/core";
import {
  trailCaptureRaster,
  trailCaptureRequests,
  trailHistoricalBounds,
  trailUpstreamPage,
} from "../../../src/effects/trail/capture-plan";
import { getTrailSamples } from "../../../src/effects/trail/samples";

it("schedules exact previous rational timestamps without manufacturing a negative past", () => {
  const effect = createEffect("trail", { settings: { echoCount: 4, delay: 0.08 } });
  const samples = getTrailSamples(effect, { value: 5, rate: 30 });
  expect(samples).toHaveLength(2);
  expect(samples[0]!.time.value / samples[0]!.time.rate).toBeCloseTo(5 / 30 - 0.08, 14);
  expect(samples[1]!.time.value / samples[1]!.time.rate).toBeCloseTo(5 / 30 - 0.16, 14);
  expect(
    samples.map(({ slot, beforeEffectId, history }) => ({ slot, beforeEffectId, history })),
  ).toEqual([0, 1].map((slot) => ({ slot, beforeEffectId: effect.id, history: "disabled" })));
  expect(getTrailSamples(effect, { value: 0, rate: 1 })).toEqual([]);
  expect(
    getTrailSamples({ ...effect, settings: { mode: "offset" } }, { value: 1, rate: 1 }),
  ).toEqual([]);
});

it("collects owner and composition requests, excluding inherited hidden owners and bounding totals", () => {
  const trail = () =>
    createEffect("trail", { settings: { mode: "temporal", echoCount: 2, delay: 0.25 } });
  const group = createLayer("group", { id: "group", visible: false });
  const owner = createLayer("rectangle", { id: "owner", effects: [trail()] });
  const hidden = createLayer("rectangle", { parentId: group.id, effects: [trail()] });
  const page = createPage({ effects: [trail()], layers: [group, owner, hidden] });
  const requests = trailCaptureRequests(page, { value: 1, rate: 1 });
  expect(requests.map((request) => request.ownerId)).toEqual([undefined, "owner"]);
  expect(() =>
    trailCaptureRequests(
      createPage({
        layers: Array.from({ length: 17 }, () => createLayer("rectangle", { effects: [trail()] })),
      }),
      { value: 1, rate: 1 },
    ),
  ).toThrow("32-snapshot");
});

it("truncates the requested upstream stack, preserves scene and masks, and excludes only temporal recursion", () => {
  const before = createEffect("brightness"),
    temporal = createEffect("trail", { settings: { mode: "temporal" } }),
    offset = createEffect("trail", { settings: { mode: "offset" } }),
    after = createEffect("contrast");
  const parent = createLayer("group", { id: "parent", opacity: 0.4, x: 80, rotation: 25 });
  const owner = createLayer("rectangle", {
    id: "owner",
    parentId: parent.id,
    effects: [offset, before, temporal, after],
    mask: { enabled: true, layerId: "mask", inverted: false, mode: "alpha" },
  });
  const neighbour = createLayer("rectangle", { effects: [temporal, offset, after] });
  const mask = createLayer("ellipse", { id: "mask", maskSource: true });
  const page = createPage({
    effects: [offset, temporal, after],
    layers: [parent, owner, neighbour, mask],
  });
  const request = { effect: temporal, ownerId: "owner", samples: [] };
  const upstream = trailUpstreamPage(page, request);
  expect(upstream.effects).toEqual([]);
  expect(upstream.layers[1]!.effects).toEqual([offset, before]);
  expect(upstream.layers[2]!.effects).toEqual([offset, after]);
  expect(upstream.layers[0]).toEqual(parent);
  expect(upstream.layers[1]!.mask).toBe(owner.mask);
  expect(upstream.layers[3]).toEqual(mask);
  expect(page.layers[1]!.effects).toEqual([offset, before, temporal, after]);
  expect(trailUpstreamPage(page, { ...request, ownerId: undefined }).effects).toEqual([offset]);
});

it("preserves exact requested density when admitted and caps only raster density under device/budget limits", () => {
  const fractional = { x: -90, y: 200, width: 3.5, height: 4.5 };
  expect(trailCaptureRaster(fractional, 1, 1, 8192, 1024)).toEqual({
    scale: 1,
    width: 4,
    height: 5,
  });
  const bounds = { x: -100, y: -200, width: 20000, height: 10000 };
  const copy = { ...bounds };
  const raster = trailCaptureRaster(bounds, 2, 32, 1024, 1024 * 1024);
  expect(raster.width).toBeLessThanOrEqual(1024);
  expect(raster.height).toBeLessThanOrEqual(1024);
  expect(raster.width * raster.height * 8 * 32).toBeLessThanOrEqual(1024 * 1024);
  expect(raster.scale).toBeGreaterThan(0);
  expect(bounds).toEqual(copy);
  expect(() => trailCaptureRaster(bounds, 1, 33, 1024, 1024)).toThrow(RangeError);
  expect(() => trailCaptureRaster(bounds, 1, 1, 1024, 7)).toThrow(RangeError);
});

it("includes upstream effect padding at the historical parent transform", () => {
  const parent = createLayer("group", { id: "parent", x: 100, y: 20 }),
    owner = createLayer("rectangle", {
      id: "owner",
      parentId: parent.id,
      x: 50,
      y: 20,
      width: 20,
      height: 20,
      effects: [createEffect("blur", { scale: 8 })],
    }),
    page = createPage({ layers: [parent, owner] }),
    bounds = trailHistoricalBounds(page, "owner", { x: 0, y: 0, width: 500, height: 500 });
  expect(bounds.x).toBeLessThan(150);
  expect(bounds.y).toBeLessThan(40);
  expect(bounds.x + bounds.width).toBeGreaterThan(170);
  expect(bounds.y + bounds.height).toBeGreaterThan(60);
});
