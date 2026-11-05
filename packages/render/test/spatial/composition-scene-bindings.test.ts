import { expect, test, vi } from "vitest";
import {
  createLayer,
  createPage,
  createSpatialLayer,
  createSpatialScene,
  type Bounds,
} from "@musart/core";
import {
  BoxGeometry,
  Color,
  Mesh,
  MeshStandardNodeMaterial,
  WebGPUCoordinateSystem,
  StandardNodeLibrary,
  type RenderTarget,
  type WebGPURenderer,
} from "three/webgpu";
import { windowProjection } from "../../src/spatial/scene/projection";
import { CompositionScene } from "../../src/spatial/scene/CompositionScene";
import { SharedShadows } from "../../src/spatial/scene/SharedShadows";
import { SpatialResource } from "../../src/spatial/SpatialResource";

function fixture() {
  let target: RenderTarget | null = null;
  const render = vi.fn();
  const renderer = {
    coordinateSystem: WebGPUCoordinateSystem,
    backend: { device: { limits: { maxTextureDimension2D: 8192 } } },
    library: new StandardNodeLibrary(),
    shadowMap: { enabled: false, type: 1 },
    autoClear: true,
    getRenderTarget: () => target,
    setRenderTarget: (next: RenderTarget | null) => {
      target = next;
    },
    getActiveCubeFace: () => 0,
    getActiveMipmapLevel: () => 0,
    getClearAlpha: () => 0,
    getClearColor: (color: Color) => color.set(0),
    setClearColor: () => {},
    render,
    compileAsync: async () => {},
  } as unknown as WebGPURenderer;
  const settings = createSpatialScene();
  settings.reflections!.mode = "environment";
  const page = createPage({
    spatial: settings,
    width: 256,
    height: 256,
    layers: [
      createLayer("rectangle", { id: "a", spatial: createSpatialLayer("box") }),
      createLayer("rectangle", { id: "b", spatial: createSpatialLayer("box") }),
    ],
  });
  const sources = page.layers.map((layer) => ({
    layer,
    resource: new SpatialResource(
      new Mesh(new BoxGeometry(), new MeshStandardNodeMaterial()),
      [],
      settings,
    ),
  }));
  const stage = new CompositionScene(renderer, settings);
  const sync = async (next = page, viewport?: Bounds) => {
    for (const source of sources) {
      source.layer = next.layers.find((layer) => layer.id === source.layer.id)!;
      source.resource.update(
        source.layer,
        { ...next.spatial!, lights: [], shadows: false },
        null,
        1,
        1,
      );
    }
    stage.sync(next, next.spatial!, sources, null, 1, viewport);
    await stage.prepare(() => true);
  };
  return {
    stage,
    sources,
    page,
    render,
    sync,
    dispose() {
      stage.dispose();
      for (const source of sources) source.resource.dispose();
    },
  };
}

test("per-source stamps keep opaque recoloring local and retain depth/shadows across appearance samples", async () => {
  const f = fixture(),
    shadows = vi.spyOn(SharedShadows.prototype, "begin");
  try {
    await f.sync();
    const a = f.stage.sourceStamp("a"),
      b = f.stage.sourceStamp("b");
    for (const source of f.sources) f.stage.render(source.layer);
    expect(f.render).toHaveBeenCalledTimes(3);
    expect(shadows).toHaveBeenCalledOnce();
    f.render.mockClear();
    await f.sync({
      ...f.page,
      layers: f.page.layers.map((layer) =>
        layer.id === "a" ? { ...layer, fill: "#ff0000" } : layer,
      ),
    });
    expect(f.stage.sourceStamp("a")).not.toBe(a);
    expect(f.stage.sourceStamp("b")).toBe(b);
    const copies = f.stage.bindingStats().synchronizations;
    f.stage.render(f.sources[0]!.layer);
    expect(f.render).toHaveBeenCalledOnce();
    expect(f.stage.bindingStats().synchronizations).toBe(copies);
    expect(shadows).toHaveBeenCalledOnce();
    expect(
      f.sources.every(
        ({ resource }) =>
          resource.root.children[0] instanceof Mesh &&
          resource.root.children[0].material === resource.material,
      ),
    ).toBe(true);
    const retainedBytes = f.stage.bytes;
    f.stage.releaseSources();
    expect(f.stage.sourceStamp("a")).toBeUndefined();
    expect(f.stage.stamp).toBe("");
    expect(f.stage.bindingStats().meshes).toBe(0);
    expect(f.stage.bytes).toBeLessThan(retainedBytes);
    await f.sync();
    expect(f.stage.sourceStamp("a")).not.toBe(a);
    expect(f.stage.sourceStamp("b")).not.toBe(b);
  } finally {
    shadows.mockRestore();
    f.dispose();
  }
});

test("camera changes redraw projected depth without refreshing unchanged native shadows; geometry changes refresh both", async () => {
  const f = fixture(),
    shadows = vi.spyOn(SharedShadows.prototype, "begin");
  try {
    await f.sync();
    f.stage.render(f.sources[0]!.layer);
    const materials = f.stage.bindingStats().synchronizations;
    f.render.mockClear();
    await f.sync({
      ...f.page,
      spatial: { ...f.page.spatial!, camera: { ...f.page.spatial!.camera, yaw: 40 } },
    });
    expect(f.stage.bindingStats().synchronizations).toBe(materials);
    f.stage.render(f.sources[0]!.layer);
    expect(f.render).toHaveBeenCalledTimes(2);
    expect(shadows).toHaveBeenCalledOnce();
    f.render.mockClear();
    await f.sync({
      ...f.page,
      layers: f.page.layers.map((layer) => ({
        ...layer,
        spatial: { ...layer.spatial!, clipTime: 0.5 },
      })),
    });
    f.stage.render(f.sources[0]!.layer);
    expect(f.render).toHaveBeenCalledTimes(2);
    expect(shadows).toHaveBeenCalledTimes(2);
  } finally {
    shadows.mockRestore();
    f.dispose();
  }
});

test("failed depth rendering restores borrowed materials and retries the unavailable depth scope", async () => {
  const f = fixture();
  try {
    await f.sync();
    f.render.mockImplementationOnce(() => {
      throw Error("native render failed");
    });
    expect(() => f.stage.render(f.sources[0]!.layer)).toThrow("native render failed");
    for (const { resource } of f.sources)
      expect((resource.content as Mesh).material).toBe(resource.material);
    f.stage.render(f.sources[0]!.layer);
    expect(f.render).toHaveBeenCalledTimes(3);
    for (const { resource } of f.sources)
      expect((resource.content as Mesh).material).toBe(resource.material);
  } finally {
    f.dispose();
  }
});

test("an expanded display gate retains off-artboard native triangles and matching depth while preserving the canonical camera", async () => {
  const f = fixture();
  try {
    const page = { ...f.page, layers: f.page.layers.map((layer) => ({ ...layer, x: 400 })) };
    await f.sync(page);
    const canonical = f.stage.camera.projectionMatrix.clone();
    const before = { ...f.stage.bounds("a")! };
    const stamp = f.stage.sourceStamp("a");
    const viewport = { x: -256, y: -128, width: 1024, height: 512 };
    await f.sync(page, viewport);
    expect(f.stage.camera.projectionMatrix.equals(canonical)).toBe(true);
    expect(f.stage.bounds("a")!.width).toBeGreaterThan(before.width);
    expect(f.stage.sourceStamp("a")).not.toBe(stamp);
    expect(f.stage.depthTarget).toMatchObject({ width: 1024, height: 512 });
    const draws: number[][] = [];
    f.render.mockImplementation(() => {
      draws.push([...f.stage.camera.projectionMatrix.elements]);
    });
    f.stage.render(f.sources[0]!.layer);
    expect(draws[0]).toEqual(windowProjection(page, viewport).multiply(canonical).elements);
    expect(draws).toHaveLength(2);
    expect(f.stage.camera.projectionMatrix.equals(canonical)).toBe(true);
    await f.sync(page);
    expect(f.stage.bounds("a")).toEqual(before);
    expect(f.stage.depthTarget).toMatchObject({ width: 256, height: 256 });
  } finally {
    f.dispose();
  }
});
