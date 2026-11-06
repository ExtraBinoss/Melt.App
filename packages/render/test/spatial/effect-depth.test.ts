import { expect, test, vi } from "vitest";
import {
  createEffect,
  createLayer,
  createPage,
  createSpatialLayer,
  createSpatialScene,
  type Bounds,
} from "@musart/core";
import {
  BoxGeometry,
  Color,
  Matrix3,
  Mesh,
  MeshStandardNodeMaterial,
  StandardNodeLibrary,
  Vector3,
  WebGPUCoordinateSystem,
  type RenderTarget,
  type WebGPURenderer,
} from "three/webgpu";
import { CompositionScene } from "../../src/spatial/scene/CompositionScene";
import { EffectDepthInputs } from "../../src/spatial/scene/EffectDepthInputs";
import { effectDepthUv, effectFocusPoint } from "../../src/spatial/scene/effect-depth-mapping";
import { windowProjection } from "../../src/spatial/scene/projection";
import { SpatialResource } from "../../src/spatial/SpatialResource";

const focus = (id: string) =>
  createEffect("depth-of-field", {
    id,
    settings: { focusMode: "point", focusX: 0.8, focusY: 0.25 },
  });

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
  const group = createLayer("group", { id: "g", x: 15, y: 10, effects: [focus("group-focus")] });
  const page = createPage({
    width: 256,
    height: 256,
    spatial: settings,
    effects: [focus("composition-focus")],
    layers: [
      group,
      createLayer("rectangle", {
        id: "a",
        parentId: "g",
        spatial: createSpatialLayer("box"),
        effects: [focus("object-focus")],
      }),
      createLayer("rectangle", { id: "b", spatial: createSpatialLayer("box") }),
    ],
  });
  const sources = page.layers
    .filter((layer) => layer.spatial)
    .map((layer) => ({
      layer,
      resource: new SpatialResource(
        new Mesh(new BoxGeometry(), new MeshStandardNodeMaterial()),
        [],
        settings,
      ),
    }));
  const stage = new CompositionScene(renderer, settings);
  const sync = async (viewport?: Bounds) => {
    for (const { resource, layer } of sources)
      resource.update(layer, { ...settings, lights: [], shadows: false }, null, 1, 1);
    stage.sync(page, settings, sources, null, 1, viewport);
    await stage.prepare(() => true);
  };
  return {
    page,
    stage,
    sources,
    render,
    renderer,
    sync,
    dispose() {
      stage.dispose();
      for (const { resource } of sources) resource.dispose();
    },
  };
}

test("native depth maps expanded source UVs through authored-plane homography and parent layout into the actual window", () => {
  const transport = { x: -20, y: -10, width: 240, height: 140 },
    layout = [0, 2, -1, 0, 300, 20] as const,
    projection = new Matrix3().set(2, 0, 10, 0, 3, 20, 0.001, 0, 1),
    viewport = { x: 30, y: 40, width: 160, height: 120 },
    mapping = new Matrix3().fromArray(
      effectDepthUv({ width: 640, height: 480 }, transport, layout, projection.elements, viewport),
    );
  const authored = new Vector3(
      0.4 * transport.width + transport.x,
      0.7 * transport.height + transport.y,
      1,
    ),
    projected = authored.clone().applyMatrix3(projection.clone().invert());
  projected.multiplyScalar(1 / projected.z);
  const result = new Vector3(0.4, 0.3, 1).applyMatrix3(mapping);
  expect(result.x / result.z).toBeCloseTo((-projected.y + 300 - viewport.x) / viewport.width, 10);
  expect(result.y / result.z).toBeCloseTo(
    (2 * projected.x + 20 - viewport.y) / viewport.height,
    10,
  );
  const point = effectFocusPoint(200, 100, 0.5, 0.5, layout, projection.elements);
  const expected = new Vector3(100, 50, 1).applyMatrix3(projection.clone().invert());
  expected.multiplyScalar(1 / expected.z);
  expect(point.x).toBeCloseTo(-expected.y + 300, 10);
  expect(point.y).toBeCloseTo(2 * expected.x + 20, 10);
});

test("composition focus renders the full camera gate point even beyond the cropped output and restores the camera", async () => {
  const f = fixture();
  try {
    await f.sync({ x: 0, y: 0, width: 32, height: 32 });
    const canonical = f.stage.camera.projectionMatrix.clone();
    const draws: { target: RenderTarget | null; projection: number[] }[] = [];
    f.render.mockImplementation(() =>
      draws.push({
        target: f.renderer.getRenderTarget(),
        projection: [...f.stage.camera.projectionMatrix.elements],
      }),
    );
    const input = f.stage.compositionDepth({ id: "composition-focus", x: 0.8, y: 0.25 })!;
    expect(input.focusTexture).toBeDefined();
    expect(input.focusTexture).not.toBe(input.texture);
    expect(draws.at(-1)!.target).toMatchObject({ width: 1, height: 1 });
    expect(draws.at(-1)!.projection).toEqual(
      windowProjection(f.page, { x: 204.8 - 0.5, y: 64 - 0.5, width: 1, height: 1 }).multiply(
        canonical,
      ).elements,
    );
    expect(f.stage.camera.projectionMatrix.equals(canonical)).toBe(true);
    expect(input.uvTransform).toEqual(new Matrix3().set(1, 0, 0, 0, -1, 1, 0, 0, 1).elements);
    expect(f.renderer.getRenderTarget()).toBeNull();
  } finally {
    f.dispose();
  }
});

test("local object/group depth isolates real owner meshes and distinct focus textures retain separate samples", async () => {
  const f = fixture();
  try {
    await f.sync();
    const draws: string[][] = [];
    f.render.mockImplementation(() =>
      draws.push(
        f.sources
          .filter(({ resource }) => resource.root.visible && resource.root.parent!.visible)
          .map(({ layer }) => layer.id),
      ),
    );
    const object = f.stage.layerDepth(
      "a",
      { x: -2, y: -2, width: 100, height: 100 },
      { id: "object-focus", x: 0.5, y: 0.5 },
    )!;
    expect(draws.slice(-2)).toEqual([["a"], ["a"]]);
    const group = f.stage.layerDepth(
      "g",
      { x: 0, y: 0, width: 200, height: 100 },
      { id: "group-focus", x: 0.5, y: 0.5 },
    )!;
    expect(draws.slice(-2)).toEqual([["a"], ["a"]]);
    expect(object.focusTexture).not.toBe(group.focusTexture);
    expect(object.texture).toBe(group.texture); // One synchronous reusable local raster.
    expect(f.stage.layerDepth("missing", { x: 0, y: 0, width: 10, height: 10 })).toBeNull();
    for (const { resource } of f.sources)
      expect((resource.content as Mesh).material).toBe(resource.material);
    const composition = f.stage.compositionDepth()!;
    expect(composition.texture).not.toBe(object.texture);
  } finally {
    f.dispose();
  }
});

test("failed point depth draws restore borrowed materials, visibility, renderer target and projection", async () => {
  const f = fixture();
  try {
    await f.sync();
    f.stage.compositionDepth();
    const camera = f.stage.camera.projectionMatrix.clone();
    f.render.mockImplementationOnce(() => {
      throw Error("point render failed");
    });
    expect(() => f.stage.compositionDepth({ id: "composition-focus", x: 0.7, y: 0.3 })).toThrow(
      "point render failed",
    );
    expect(f.stage.camera.projectionMatrix.equals(camera)).toBe(true);
    expect(f.renderer.getRenderTarget()).toBeNull();
    for (const { resource } of f.sources) {
      expect(resource.root.visible).toBe(true);
      expect(resource.root.parent!.visible).toBe(true);
      expect((resource.content as Mesh).material).toBe(resource.material);
    }
    expect(
      f.stage.compositionDepth({ id: "composition-focus", x: 0.7, y: 0.3 })!.focusTexture,
    ).toBeDefined();
  } finally {
    f.dispose();
  }
});

test("native focus allocation is admitted, charged, pruned and disposed with an explicit point budget", () => {
  const inputs = new EffectDepthInputs(),
    effect = focus("point"),
    owner = createLayer("rectangle", {
      id: "owner",
      spatial: createSpatialLayer("box"),
      effects: [effect],
    }),
    page = createPage({ layers: [owner] });
  const admitted = inputs.projectedBytes(320, 200, page);
  inputs.sync(page, 320, 200, [owner.id]);
  expect(inputs.bytes).toBe(admitted);
  expect(inputs.targets).toBe(2);
  const target = inputs.localTarget(owner.id)!,
    disposed = vi.fn();
  target.addEventListener("dispose", disposed);
  inputs.sync({ ...page, layers: [{ ...owner, effects: [] }] }, 320, 200, [owner.id]);
  expect(disposed).toHaveBeenCalledOnce();
  expect(inputs.bytes).toBe(0);
  expect(inputs.targets).toBe(0);
  const tooMany = createPage({
    effects: Array.from({ length: 65 }, (_, index) => focus(String(index))),
  });
  expect(() => inputs.projectedBytes(320, 200, tooMany)).toThrow("64-point");
  inputs.clear();
});
