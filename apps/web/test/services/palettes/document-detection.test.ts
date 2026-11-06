import { describe, expect, it } from "vitest";
import { createEffect, createLayer, createPage, createProject } from "@musart/core";
import type { ImageAsset } from "@musart/core";
import {
  detectedSwatches,
  normalizePaletteColor,
  sampleSourceColors,
} from "../../../src/services/palettes/detection/colors";
import { extractDocumentPalette } from "../../../src/services/palettes/detection/extract";

const image: ImageAsset = {
  id: "photo",
  name: "Original",
  width: 20,
  height: 20,
  mime: "image/png",
  dataUrl: "data:image/png;base64,eA==",
};

describe("document palette source approximation", () => {
  it("weights visible geometry and inherited opacity, excludes hidden masks and media placeholder colors", () => {
    const page = createPage({
      width: 100,
      height: 100,
      background: "transparent",
      layers: [
        createLayer("rectangle", {
          id: "red",
          x: 0,
          y: 0,
          width: 20,
          height: 10,
          fill: "#f00",
          opacity: 0.5,
        }),
        createLayer("group", {
          id: "group",
          opacity: 0.5,
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          fill: "#123456",
        }),
        createLayer("ellipse", {
          id: "child",
          parentId: "group",
          x: 0,
          y: 0,
          width: 10,
          height: 10,
          fill: "#00f",
        }),
        createLayer("rectangle", { id: "hidden", visible: false, fill: "#abcdef" }),
        createLayer("rectangle", { id: "mask", maskSource: true, fill: "#fedcba" }),
        createLayer("group", { id: "hidden-parent", visible: false }),
        createLayer("rectangle", {
          id: "hidden-child",
          parentId: "hidden-parent",
          fill: "#123abc",
        }),
        createLayer("image", {
          id: "photo",
          assetId: image.id,
          x: 0,
          y: 0,
          width: 20,
          height: 20,
          fill: "#678901",
        }),
        createLayer("rectangle", { id: "outside", x: 101, width: 10, fill: "#112233" }),
      ],
    });
    const project = createProject({ pages: [page], assets: { [image.id]: image } });
    const sources = extractDocumentPalette(project, page);
    expect(sources.colors).toEqual([
      { value: "#ff0000", weight: 100 },
      { value: "#0000ff", weight: (50 * Math.PI) / 4 },
    ]);
    expect(sources.images).toEqual([{ asset: image, weight: 400 }]);
    expect(project.pages[0]!.colorLinks).toBeUndefined();
    expect(project.colors).toBeUndefined();
  });

  it("clips transformed footprints and accounts for gradients, stroke alpha and enabled effect colors", () => {
    const page = createPage({
      width: 100,
      height: 100,
      background: "transparent",
      layers: [
        createLayer("rectangle", {
          x: 90,
          y: 0,
          width: 20,
          height: 10,
          fill: "#ffffff",
          stroke: "#ff000080",
          strokeWidth: 1,
          fillGradient: {
            kind: "linear",
            angle: 0,
            stops: [
              { offset: 0, color: "#000" },
              { offset: 1, color: "#fff" },
            ],
          },
          effects: [
            createEffect("shadow", { settings: { shadowColor: "#0f0" }, opacity: 0.25 }),
            createEffect("shadow", { enabled: false, settings: { shadowColor: "#123456" } }),
          ],
        }),
      ],
    });
    const { colors } = extractDocumentPalette(createProject({ pages: [page] }), page);
    expect(colors).toContainEqual({ value: "#000000", weight: 50 });
    expect(colors).toContainEqual({ value: "#ffffff", weight: 50 });
    expect(colors).toContainEqual({ value: "#ff000080", weight: (30 * 128) / 255 });
    expect(colors).toContainEqual({ value: "#00ff00", weight: 25 });
    expect(colors.some((color) => color.value === "#123456")).toBe(false);
  });

  it("deduplicates original images and bounds decoding to sixteen largest sources", () => {
    const assets = Object.fromEntries(
      Array.from({ length: 20 }, (_, index) => [
        `asset${index}`,
        { ...image, id: `asset${index}` },
      ]),
    );
    const layers = Array.from({ length: 20 }, (_, index) =>
      createLayer("image", { x: 0, y: 0, width: 20 + index, height: 20, assetId: `asset${index}` }),
    );
    layers.push(createLayer("image", { x: 0, y: 0, width: 50, height: 50, assetId: "asset0" }));
    const page = createPage({ width: 100, height: 100, layers });
    const sources = extractDocumentPalette(createProject({ pages: [page], assets }), page);
    expect(sources.images).toHaveLength(16);
    expect(sources.images[0]).toMatchObject({ asset: { id: "asset0" }, weight: 2900 });
    expect(new Set(sources.images.map(({ asset }) => asset.id)).size).toBe(16);
  });
});

it("ranks canonical literals with stable IDs and ignores invisible/invalid colors", () => {
  const colors = detectedSwatches([
    { value: "#ABC", weight: 1 },
    { value: "#aabbccff", weight: 2 },
    { value: "#123456", weight: 4 },
    { value: "transparent", weight: 100 },
    { value: "#12345600", weight: 10 },
    { value: "invalid", weight: 100 },
  ]);
  expect(colors.map(({ value }) => value)).toEqual(["#123456", "#aabbcc"]);
  expect(detectedSwatches([{ value: "#abc", weight: 100 }])[0]!.id).toBe(colors[1]!.id);
  expect(normalizePaletteColor("#abcd")).toBe("#aabbccdd");
});

it("weights source transparency and merges nearby RGB samples without rewarding transparent pixels", () => {
  const colors = sampleSourceColors(
    new Uint8ClampedArray([255, 0, 0, 255, 252, 0, 0, 255, 0, 0, 255, 128, 0, 255, 0, 0]),
  );
  expect(colors).toEqual([
    { value: "#fe0000ff", weight: 0.5 },
    { value: "#0000ff80", weight: 128 / 255 / 4 },
  ]);
  expect(sampleSourceColors(new Uint8ClampedArray())).toEqual([]);
});
