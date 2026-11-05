import { expect, test } from "vitest";
import { spawnSync } from "node:child_process";
import {
  createLayer,
  createPage,
  createProject,
  EditorEngine,
  parseProject,
  serializeProject,
  createEffect,
  editVectorPath,
} from "@musart/core";
import { SHAPE_CATALOG, type CatalogAsset } from "@musart/assets";
import { SVGLoader } from "three/addons/loaders/SVGLoader.js";
import { backgroundLayer, createBackgroundLayer } from "../../../src/ui/studio/background/model";
import { insertLibraryVector } from "../../../src/components/spatial/objects/vector";

function fixture() {
  const foreground = createLayer("text", { text: "Hello", id: "foreground" });
  const engine = new EditorEngine(
    createProject({
      pages: [
        createPage({
          width: 1200,
          height: 900,
          layers: [foreground],
          background: "#d8d0ff",
          backgroundGradient: {
            kind: "linear",
            angle: 35,
            stops: [
              { offset: 0, color: "#8b5cf6" },
              { offset: 1, color: "#32d393" },
            ],
          },
        }),
      ],
    }),
  );
  engine.select([foreground.id]);
  return engine;
}
test("background conversion preserves the original paint, foreground and selection with one undo entry", () => {
  const engine = fixture();
  const before = engine.getSnapshot();
  const result = createBackgroundLayer(engine, "Background");
  const after = engine.getSnapshot();
  const page = after.project.pages[0]!;
  expect(page.layers[0]).toEqual(result);
  expect(result.fill).toBe(before.project.pages[0]!.background);
  expect(result.fillGradient).toEqual(before.project.pages[0]!.backgroundGradient);
  expect(page.background).toBe("#00000000");
  expect(page.backgroundGradient).toBeUndefined();
  expect(page.layers[1]).toEqual(before.project.pages[0]!.layers[0]);
  expect(after.selection).toEqual(before.selection);
  expect(parseProject(serializeProject(after.project))).toEqual(after.project);
  engine.undo();
  expect(engine.getSnapshot().project).toEqual(before.project);
  expect(engine.getSnapshot().canUndo).toBe(false);
  engine.redo();
  expect(engine.getSnapshot().project).toEqual(after.project);
});
test("background remains a regular stackable layer and repeated conversion does not duplicate it", () => {
  const engine = fixture();
  const first = createBackgroundLayer(engine, "Background");
  const revision = engine.getSnapshot().revision;
  expect(createBackgroundLayer(engine, "Other").id).toBe(first.id);
  expect(engine.getSnapshot().revision).toBe(revision);
  engine.execute({
    type: "updateLayers",
    ids: [first.id],
    patch: { effects: [createEffect("blur"), createEffect("grain")] },
  });
  expect(
    backgroundLayer(engine.getSnapshot().project.pages[0]!)?.effects.map((e) => e.type),
  ).toEqual(["blur", "grain"]);
});
test("the background resolver never adopts a transformed, nested or native 3D object", () => {
  const page = createPage({
    layers: [createLayer("rectangle", { x: 0, y: 0, width: 1080, height: 1080, rotation: 5 })],
  });
  expect(backgroundLayer(page)).toBeUndefined();
  expect(
    backgroundLayer({ ...page, layers: [{ ...page.layers[0]!, rotation: 0, parentId: "group" }] }),
  ).toBeUndefined();
});
test("SVG insertion uses one native editable extrusion and undo removes its scene atomically", () => {
  const engine = fixture();
  const before = engine.getSnapshot().project;
  const asset = SHAPE_CATALOG[0]!;
  const layer = insertLibraryVector(engine, asset, true);
  const page = engine.getSnapshot().project.pages[0]!;
  expect(layer.kind).toBe("vector");
  expect(layer.spatial).toMatchObject({ enabled: true, source: "extrude", depth: 0.3 });
  expect(layer.vector?.path).toBe(asset.path);
  expect(page.spatial).toBeDefined();
  expect(page.motion).toBeUndefined();
  expect(engine.getSnapshot().selection).toEqual([layer.id]);
  expect(parseProject(serializeProject(engine.getSnapshot().project))).toEqual(
    engine.getSnapshot().project,
  );
  engine.undo();
  expect(engine.getSnapshot().project).toEqual(before);
  expect(engine.getSnapshot().canUndo).toBe(false);
});
test("flat SVGs remain flat and adding volume retains the existing shared scene", () => {
  const engine = fixture();
  const flat = insertLibraryVector(engine, SHAPE_CATALOG[0]!, false);
  expect(flat.spatial).toBeUndefined();
  expect(engine.getSnapshot().project.pages[0]!.spatial).toBeUndefined();
  insertLibraryVector(engine, SHAPE_CATALOG[0]!, true);
  const scene = engine.getSnapshot().project.pages[0]!.spatial;
  insertLibraryVector(engine, SHAPE_CATALOG[1]!, true);
  expect(engine.getSnapshot().project.pages[0]!.spatial).toEqual(scene);
});

function strokeIcon(patch: Partial<CatalogAsset> = {}): CatalogAsset {
  return {
    id: "stroke-icon",
    name: "Stroke icon",
    viewBox: "0 0 24 24",
    path: "M2 12H22",
    strokeOnly: true,
    ...patch,
  };
}

test("stroke-only icons become editable filled native outlines with round caps and one atomic undo", () => {
  const engine = fixture(),
    before = engine.getSnapshot().project;
  const layer = insertLibraryVector(engine, strokeIcon(), true);
  expect(layer.spatial?.source).toBe("extrude");
  expect(layer.vector?.strokeOnly).toBe(false);
  expect(layer.vector?.parts).toHaveLength(1);
  const contours = editVectorPath(layer.vector!.parts![0]!);
  expect(contours).toHaveLength(1);
  expect(contours[0]!.closed).toBe(true);
  const xs = contours[0]!.nodes.map((node) => node.x),
    ys = contours[0]!.nodes.map((node) => node.y);
  expect(Math.min(...xs)).toBeCloseTo(1, 4);
  expect(Math.max(...xs)).toBeCloseTo(23, 4);
  expect(Math.min(...ys)).toBeCloseTo(11, 4);
  expect(Math.max(...ys)).toBeCloseTo(13, 4);
  expect(parseProject(serializeProject(engine.getSnapshot().project))).toEqual(
    engine.getSnapshot().project,
  );
  engine.undo();
  expect(engine.getSnapshot().project).toEqual(before);
  expect(engine.getSnapshot().canUndo).toBe(false);
  engine.redo();
  expect(engine.getSnapshot().project.pages[0]!.layers.at(-1)).toEqual(layer);
});

test("a closed outlined icon retains its hole instead of filling its center", () => {
  const layer = insertLibraryVector(fixture(), strokeIcon({ path: "M4 4H20V20H4Z" }), true);
  const path = layer.vector!.parts![0]!.path;
  const parsed = new SVGLoader().parse(
    `<svg xmlns="http://www.w3.org/2000/svg"><path d="${path}"/></svg>`,
  );
  const shapes = parsed.paths.flatMap((part) => part.toShapes());
  expect(shapes).toHaveLength(1);
  expect(shapes[0]!.holes).toHaveLength(1);
});

test("outlining preserves explicit stroke paint, opacity, transforms and attribution", () => {
  const matrix: [number, number, number, number, number, number] = [2, 0, 0, 3, 5, 7];
  const layer = insertLibraryVector(
    fixture(),
    strokeIcon({
      path: undefined,
      strokeOnly: false,
      preserveColors: true,
      attribution: "Original SVG attribution",
      parts: [
        {
          path: "M2 12H22",
          fill: "none",
          stroke: "#ea3344",
          strokeWidth: 4,
          linecap: "butt",
          opacity: 0.4,
          matrix,
        },
      ],
    }),
    true,
  );
  expect(layer.vector).toMatchObject({
    preserveColors: true,
    attribution: "Original SVG attribution",
    strokeOnly: false,
  });
  expect(layer.vector!.parts).toHaveLength(1);
  expect(layer.vector!.parts![0]).toMatchObject({
    fill: "#ea3344",
    opacity: 0.4,
    matrix,
    fillRule: "nonzero",
  });
  const nodes = editVectorPath(layer.vector!.parts![0]!).flatMap((contour) => contour.nodes);
  expect(Math.min(...nodes.map((node) => node.x))).toBeCloseTo(9, 4);
  expect(Math.min(...nodes.map((node) => node.y))).toBeCloseTo(37, 4);
});

test("mixed filled and stroked SVGs retain their paint order as bounded editable parts", () => {
  const layer = insertLibraryVector(
    fixture(),
    strokeIcon({
      path: undefined,
      strokeOnly: false,
      preserveColors: true,
      parts: [{ path: "M4 4H20V20H4Z", fill: "#ffcc00", stroke: "#223344", strokeWidth: 2 }],
    }),
    true,
  );
  expect(layer.vector!.parts).toHaveLength(2);
  expect(layer.vector!.parts![0]).toMatchObject({
    fill: "#ffcc00",
    stroke: "none",
    path: "M4 4H20V20H4Z",
  });
  expect(layer.vector!.parts![1]).toMatchObject({ fill: "#223344", fillRule: "nonzero" });
  expect(layer.vector!.parts![1]!.stroke).toBeUndefined();
});

test("unsupported SVG part counts and stroke complexity reject before document mutation", () => {
  const engine = fixture(),
    original = engine.getSnapshot().project;
  const tooMany = strokeIcon({
    path: undefined,
    strokeOnly: false,
    parts: Array.from({ length: 257 }, () => ({ path: "M0 0H1V1Z" })),
  });
  expect(() => insertLibraryVector(engine, tooMany, true)).toThrow(/256/);
  expect(engine.getSnapshot().project).toBe(original);
  const complex = strokeIcon({
    path: "M0 0" + Array.from({ length: 1100 }, (_, at) => `L${at} ${at % 2}`).join(""),
  });
  expect(() => insertLibraryVector(engine, complex, true)).toThrow();
  expect(engine.getSnapshot().project).toBe(original);
  expect(engine.getSnapshot().canUndo).toBe(false);
});

test("flat insertion preserves the original editable stroke source", () => {
  const asset = strokeIcon();
  const layer = insertLibraryVector(fixture(), asset, false);
  expect(layer.spatial).toBeUndefined();
  expect(layer.vector).toMatchObject({ strokeOnly: true, path: asset.path });
  expect(layer.vector?.parts).toBeUndefined();
});

test("the exact first Lucide catalog icon outlines and validates inside a bounded child process", () => {
  const result = spawnSync(
    "bun",
    [
      "--eval",
      `
    import { JSDOM } from "jsdom";
    import { readFileSync } from "node:fs";
    import { prepareVectorStrokeOutlines } from "./packages/render/src/surface/vector/stroke-outlines.ts";
    import { createLayer, createSpatialLayer, createPage, createProject, EditorEngine, serializeProject, parseProject } from "./packages/core/src/index.ts";
    const dom = new JSDOM();
    globalThis.DOMParser = dom.window.DOMParser;
    try {
      const icon = JSON.parse(readFileSync("packages/assets/data/icons/part-01.json", "utf8"))[0];
      if (icon.id !== "lucide:a-arrow-down") throw new Error("The exact catalog fixture changed");
      const vector = prepareVectorStrokeOutlines(icon, "#888888");
      const layer = createLayer("vector", { vector, spatial: createSpatialLayer("extrude") });
      const engine = new EditorEngine(createProject({ pages: [createPage()] }));
      const before = serializeProject(engine.getSnapshot().project);
      engine.execute({ type: "addLayers", layers: [layer] });
      const after = serializeProject(engine.getSnapshot().project);
      const roundtrip = serializeProject(parseProject(after)) === after;
      engine.undo();
      console.log(JSON.stringify({ id: icon.id, source: layer.spatial.source,
        strokeOnly: vector.strokeOnly, parts: vector.parts.length,
        editable: vector.parts.every((part) => part.path.startsWith("M") && part.path.endsWith("Z")),
        roundtrip, undo: serializeProject(engine.getSnapshot().project) === before,
        canUndo: engine.getSnapshot().canUndo }));
    } finally { dom.window.close(); }
  `,
    ],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      timeout: 4000,
      killSignal: "SIGKILL",
      maxBuffer: 64 * 1024,
    },
  );
  expect(result.error, result.stderr).toBeUndefined();
  expect(result.status, result.stderr).toBe(0);
  expect(JSON.parse(result.stdout)).toEqual({
    id: "lucide:a-arrow-down",
    source: "extrude",
    strokeOnly: false,
    parts: 1,
    editable: true,
    roundtrip: true,
    undo: true,
    canUndo: false,
  });
});
