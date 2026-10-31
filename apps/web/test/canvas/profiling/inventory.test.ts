import {
  createEffect,
  createLayer,
  createPage,
  type CompositionMotion,
  type MotionAnimationPreset,
} from "@musart/core";
import { expect, test } from "vitest";
import { compositionInventory } from "../../../src/canvas/profiling/inventory";

function counts(page: Parameters<typeof compositionInventory>[0]) {
  return Object.fromEntries(compositionInventory(page).map((metric) => [metric.id, metric.value]));
}

test("counts every layer kind and enabled attachments, with effective ancestry and opacity visibility", () => {
  const page = createPage({
    layers: [
      createLayer("image", { id: "image", parentId: "hidden", effects: [createEffect("blur")] }),
      createLayer("group", { id: "hidden", parentId: "root", visible: false }),
      createLayer("rectangle", {
        id: "rectangle",
        parentId: "root",
        effects: [
          createEffect("grayscale"),
          createEffect("blur"),
          createEffect("contrast", { enabled: false }),
        ],
        mask: { enabled: false, inverted: false, assetId: "mask" },
      }),
      createLayer("ellipse", { id: "ellipse", opacity: 0 }),
      createLayer("vector", { id: "vector" }),
      createLayer("text", { id: "text", visible: false }),
      createLayer("video", { id: "video" }),
      createLayer("group", {
        id: "root",
        opacity: 0.5,
        mask: { enabled: true, inverted: true, assetId: "mask" },
      }),
    ],
  });
  const before = structuredClone(page);
  expect(counts(page)).toEqual({
    layers: 8,
    visibleLayers: 4,
    groups: 2,
    effects: 3,
    masks: 1,
    images: 1,
    videos: 1,
    shapes: 3,
    textLayers: 1,
    animationTracks: 0,
    animationChannels: 0,
    audioTracks: 0,
  });
  expect(
    compositionInventory(page).every(
      (metric) =>
        metric.kind === "inventory" &&
        metric.unit === "count" &&
        metric.availability === "measured",
    ),
  ).toBe(true);
  expect(page).toEqual(before);
});

test("hidden mask-source subtrees and zero-opacity ancestors are excluded from visibility", () => {
  const page = createPage({
    layers: [
      createLayer("group", { id: "source", maskSource: true }),
      createLayer("rectangle", { parentId: "source" }),
      createLayer("group", { id: "transparent", opacity: 0 }),
      createLayer("text", { parentId: "transparent" }),
      createLayer("rectangle", { opacity: Number.MIN_VALUE }),
    ],
  });
  expect(counts(page)).toMatchObject({
    layers: 5,
    visibleLayers: 1,
    groups: 2,
    shapes: 2,
    textLayers: 1,
  });
});

function preset(count: number): MotionAnimationPreset {
  return {
    version: 1,
    id: `preset-${count}`,
    name: "Move",
    category: "move",
    duration: 1,
    effects: [],
    channels: Array.from({ length: count }, () => ({
      target: { kind: "layer", property: "x" },
      operation: "add",
      points: [
        { at: 0, value: 0 },
        { at: 1, value: 1 },
      ],
    })),
  };
}

test("reports stored Motion occurrences, authored plus enabled action channels, and independent sound clips", () => {
  const start = { value: 0, rate: 30 },
    end = { value: 30, rate: 30 };
  const motion: CompositionMotion = {
    version: 2,
    initialized: true,
    mode: "static",
    duration: end,
    frameRate: { numerator: 30, denominator: 1 },
    tracks: [
      {
        id: "first",
        layerId: "layer",
        start,
        end,
        properties: [
          { id: "x", target: { kind: "layer", layerId: "layer", property: "x" }, keyframes: [] },
          { id: "y", target: { kind: "layer", layerId: "layer", property: "y" }, keyframes: [] },
        ],
        animations: [
          {
            id: "enabled",
            preset: preset(2),
            start,
            duration: end,
            enabled: true,
            strength: 1,
            effectIds: [],
          },
          {
            id: "disabled",
            preset: preset(3),
            start,
            duration: end,
            enabled: false,
            strength: 1,
            effectIds: [],
          },
        ],
      },
      {
        id: "repeated",
        layerId: "layer",
        start: end,
        end: null,
        properties: [
          {
            id: "opacity",
            target: { kind: "layer", layerId: "layer", property: "opacity" },
            keyframes: [],
          },
        ],
      },
    ],
    audioTracks: [
      {
        id: "sound",
        name: "Sound",
        assetId: "audio",
        start,
        end,
        sourceIn: start,
        mute: false,
        volume: 1,
      },
      {
        id: "muted",
        name: "Muted",
        assetId: "audio",
        start,
        end,
        sourceIn: start,
        mute: true,
        volume: 1,
      },
      {
        id: "silent",
        name: "Silent",
        assetId: "audio",
        start,
        end,
        sourceIn: start,
        mute: false,
        volume: 0,
      },
    ],
  };
  const page = createPage({ layers: [createLayer("video", { id: "layer" })], motion });
  expect(counts(page)).toMatchObject({
    videos: 1,
    animationTracks: 2,
    animationChannels: 5,
    audioTracks: 3,
  });
});

test("handles deeply nested, reverse-ordered hierarchies without recursive stack growth", () => {
  const layers = Array.from({ length: 5_000 }, (_, index) =>
    createLayer("group", {
      id: `group-${index}`,
      parentId: index ? `group-${index - 1}` : null,
    }),
  ).reverse();
  expect(counts(createPage({ layers }))).toMatchObject({
    layers: 5_000,
    groups: 5_000,
    visibleLayers: 5_000,
  });
});

test("rejects corrupt hierarchy graphs instead of hanging or inventing visibility", () => {
  for (const layers of [
    [createLayer("rectangle", { parentId: "missing" })],
    [createLayer("group", { id: "cycle", parentId: "cycle" })],
    [createLayer("group", { id: "same" }), createLayer("image", { id: "same" })],
  ])
    expect(() => compositionInventory(createPage({ layers }))).toThrow();
});
