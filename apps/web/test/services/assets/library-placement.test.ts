import { afterEach, expect, test, vi } from "vitest";
import { Vector3, WebGLCoordinateSystem } from "three";
import { SHAPE_CATALOG } from "@musart/assets";
import {
  createPage,
  createProject,
  createSpatialScene,
  EditorEngine,
  SpatialGeometry,
} from "@musart/core";
import {
  createSpatialCamera,
  updateCompositionCamera,
} from "../../../../../packages/render/src/spatial/camera";
import { insertLibraryArtwork } from "../../../src/services/assets/library-artwork";
import { insertSpatialObject } from "../../../src/services/assets/spatial-import";
import { libraryPlacementPoint } from "../../../src/services/assets/library-placement";
import {
  beginLibraryDrag,
  cancelLibraryDrop,
  dropLibraryItem,
} from "../../../src/services/assets/library-drag";

afterEach(() => window.dispatchEvent(new Event("dragend")));

test.each(["perspective", "orthographic"] as const)(
  "%s drops stay at the pointer through camera orbit and reframing",
  (projection) => {
    for (const yaw of [0, 35, 180]) {
      const scene = createSpatialScene();
      const page = createPage({
        width: 800,
        height: 600,
        spatial: {
          ...scene,
          camera: { ...scene.camera, projection, yaw, pitch: 20, distance: 7 },
          viewport: { x: 125, y: -80, width: 1200, height: 900 },
        },
      });
      const engine = new EditorEngine(createProject({ pages: [page] }));
      const before = engine.getSnapshot().project;
      const pointer = { x: 470, y: 240 };
      const layer = insertSpatialObject(engine, "box", "Box", { point: pointer });
      const current = engine.getSnapshot().project.pages[0]!;
      const world = new SpatialGeometry(current).anchorMatrix(layer.id);
      const camera = createSpatialCamera(current.spatial!.camera, current.width / current.height);
      updateCompositionCamera(camera, current, WebGLCoordinateSystem);
      const projected = new Vector3(world[12], world[13], world[14]).project(camera);
      expect(((projected.x + 1) * current.width) / 2).toBeCloseTo(pointer.x, 7);
      expect(((1 - projected.y) * current.height) / 2).toBeCloseTo(pointer.y, 7);
      engine.undo();
      expect(engine.getSnapshot().project).toEqual(before);
      expect(engine.getSnapshot().canUndo).toBe(false);
      engine.redo();
      expect(engine.getSnapshot().project.pages[0]!.layers[0]).toEqual(layer);
    }
  },
);

test("flat artwork centers on the pointer and native creation includes its scene in one undo", () => {
  const engine = new EditorEngine(
    createProject({ pages: [createPage({ width: 800, height: 600 })] }),
  );
  const before = engine.getSnapshot().project;
  const layer = insertLibraryArtwork(engine, SHAPE_CATALOG[0]!, { x: 215, y: 370 });
  expect(layer.x + layer.width / 2).toBe(215);
  expect(layer.y + layer.height / 2).toBe(370);
  expect(engine.getSnapshot().selection).toEqual([layer.id]);
  engine.undo();
  expect(engine.getSnapshot().project).toEqual(before);
  insertSpatialObject(engine, "box", "Box", { point: { x: 215, y: 370 } });
  expect(engine.getSnapshot().project.pages[0]!.spatial).toBeDefined();
  engine.undo();
  expect(engine.getSnapshot().project).toEqual(before);
  expect(engine.getSnapshot().canUndo).toBe(false);
  const scene = createSpatialScene();
  expect(() =>
    libraryPlacementPoint(
      createPage({ spatial: { ...scene, camera: { ...scene.camera, yaw: 90 } } }),
      { x: 100, y: 100 },
    ),
  ).toThrow();
});

test.each(["edit", "page", "dispose"])(
  "pending drops reject stale %s without inserting or reporting a fake failure",
  async (change) => {
    const engine = new EditorEngine(
      createProject({ pages: [createPage({ id: "a" }), createPage({ id: "b" })] }),
    );
    const values = new Map<string, string>();
    const transfer = {
      types: [],
      effectAllowed: "none",
      setData: (key: string, value: string) => values.set(key, value),
      getData: (key: string) => values.get(key),
    } as unknown as DataTransfer;
    Object.defineProperty(transfer, "types", { get: () => [...values.keys()] });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const error = vi.fn();
    beginLibraryDrag({ dataTransfer: transfer }, engine, async (target) => {
      await gate;
      target.assertCurrent();
      insertLibraryArtwork(engine, SHAPE_CATALOG[0]!, target.point);
    });
    expect(
      dropLibraryItem(transfer, engine, { pageId: "a", point: { x: 100, y: 100 } }, error),
    ).toBe(true);
    expect(
      dropLibraryItem(transfer, engine, { pageId: "a", point: { x: 100, y: 100 } }, error),
    ).toBe(false);
    await Promise.resolve();
    if (change === "edit") engine.execute({ type: "updatePage", patch: { name: "Changed" } });
    else if (change === "page") engine.setPage("b");
    else cancelLibraryDrop(engine);
    release();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(engine.getSnapshot().project.pages.every((page) => page.layers.length === 0)).toBe(true);
    expect(error).not.toHaveBeenCalled();
  },
);
