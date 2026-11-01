import { expect, it } from "vitest";
import { createEffect, createLayer, createPage, createSpatialLayer } from "@musart/core";
import { scanPlan, scanSampleTime, stripRectangle } from "../../../src/effects/time-warp-scan/plan";
import { captureComposition } from "../../../src/effects/time-warp-scan/source";

it("uses composition time in Motion and manual progress for stills, with stable capture keys", () => {
  const effect = createEffect("time-warp-scan", {
    time: 1,
    settings: { start: 0.5, duration: 2, progress: 0.8 },
  });
  expect(scanPlan(effect, true).phase).toBe(0.25);
  expect(scanPlan(effect, false).phase).toBe(0.8);
  expect(
    scanPlan({ ...effect, settings: { ...effect.settings, progress: 0.1, lineWidth: 5 } }, true)
      .settingsKey,
  ).toBe(scanPlan(effect, true).settingsKey);
  expect(scanPlan({ ...effect, time: 99 }, true).phase).toBe(1);
});

it.each(["down", "up", "left", "right"])(
  "partitions a fractional content rectangle without gaps: %s",
  (direction) => {
    const strips = Array.from({ length: 7 }, (_, index) =>
      stripRectangle(65, 71, { x: 3.5, y: 2.25, width: 57.5, height: 65.5 }, direction, index, 7),
    );
    const vertical = direction === "down" || direction === "up";
    const coverage = Array.from({ length: vertical ? 71 : 65 }, () => 0);
    for (const strip of strips)
      for (
        let i = vertical ? strip.y : strip.x;
        i < (vertical ? strip.y + strip.height : strip.x + strip.width);
        i++
      )
        coverage[i]++;
    expect(coverage.every((count) => count === 1)).toBe(true);
  },
);

it("isolates the original source graph and preceding effects without touching the original composition", () => {
  const fx = createEffect("time-warp-scan", { id: "scan" });
  const layers = [
    createLayer("group", {
      id: "group",
      effects: [createEffect("thermal", { id: "prefix" }), fx, createEffect("bevel")],
    }),
    createLayer("rectangle", { id: "child", parentId: "group" }),
    createLayer("rectangle", { id: "other" }),
  ];
  const page = createPage({ layers });
  const sampled = captureComposition(page, "group", "scan");
  expect(sampled.layers.map((layer) => layer.id)).toEqual(["group", "child"]);
  expect(sampled.layers[0]!.effects.map((effect) => effect.id)).toEqual(["prefix"]);
  expect(sampled.layers[1]).toBe(layers[1]);
  expect(page.layers[0]!.effects).toHaveLength(3);
  expect(() => captureComposition(page, "group", "missing")).toThrow();
});

it("can sample an uncommitted catalogue preview while preserving canonical preceding effects", () => {
  const thermal = createEffect("thermal", { id: "prefix" });
  const page = createPage({
    layers: [createLayer("rectangle", { id: "item", effects: [thermal] })],
  });
  expect(captureComposition(page, "item", "preview-scan", [thermal]).layers[0]!.effects).toEqual([
    thermal,
  ]);
});

it("retains external mask dependencies, their ancestors and shared spatial peers", () => {
  const scan = createEffect("time-warp-scan", { id: "scan" });
  const page = createPage({
    layers: [
      createLayer("group", { id: "owner", effects: [scan] }),
      createLayer("rectangle", {
        id: "child",
        parentId: "owner",
        spatial: createSpatialLayer("sphere"),
        mask: { enabled: true, inverted: false, layerId: "mask" },
      }),
      createLayer("group", { id: "mask-parent" }),
      createLayer("rectangle", { id: "mask", parentId: "mask-parent" }),
      createLayer("rectangle", { id: "peer", spatial: createSpatialLayer("box") }),
      createLayer("rectangle", { id: "unrelated" }),
    ],
  });
  const captured = captureComposition(page, "owner", "scan");
  expect(captured.layers.map((layer) => layer.id)).toEqual([
    "owner",
    "child",
    "mask-parent",
    "mask",
    "peer",
  ]);
  expect(captured.layers.find((layer) => layer.id === "child")!.mask!.layerId).toBe("mask");
});

it("samples exact frame-rate subdivisions instead of rounding to a preceding decoded frame", () => {
  const plan = scanPlan(
    createEffect("time-warp-scan", { settings: { duration: 2, samples: 60 } }),
    true,
  );
  expect(scanSampleTime(plan, 1, 0)).toEqual({ value: 1, rate: 30 });
  expect(scanSampleTime({ ...plan, start: 0.5 }, 1, 0.25)).toEqual({ value: 17, rate: 60 });
  expect(scanSampleTime(plan, 0, 1)).toEqual({ value: 0, rate: 1 });
});
