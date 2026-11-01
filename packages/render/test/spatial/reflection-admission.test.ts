import { afterEach, expect, test, vi } from "vitest";
import { createLayer, createPage, createSpatialLayer, createSpatialScene } from "@musart/core";
import {
  BoxGeometry,
  Group,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  MeshStandardNodeMaterial,
  CubeRenderTarget,
  SphereGeometry,
  Texture,
  type Scene,
  type Vector3,
  type WebGPURenderer,
} from "three/webgpu";
import { GpuResourceCache } from "../../src/cache/GpuResourceCache";
import type { EnvironmentSources } from "../../src/spatial/EnvironmentSources";
import { SpatialResource } from "../../src/spatial/SpatialResource";
import { CaptureScene } from "../../src/spatial/reflections/CaptureScene";
import { SceneReflections } from "../../src/spatial/reflections/SceneReflections";
import { ReflectionResource } from "../../src/spatial/reflections/Resource";
import { REFLECTION_BUDGETS, type ReflectionSource } from "../../src/spatial/reflections/model";
import { admitMeshes, enumerateMeshes } from "../../src/spatial/reflections/meshes";

const renderer = {
  library: { fromMaterial: () => new MeshStandardNodeMaterial() },
} as unknown as WebGPURenderer;
function boundNodeMaterial(mesh: Mesh) {
  const material = mesh.material;
  if (!(material instanceof MeshStandardNodeMaterial))
    throw new Error("Receiver did not receive a native node material");
  return material;
}
const cleanups: (() => void)[] = [];
function fixture({
  source = "glb",
  useModelMaterials = true,
  quality = "balanced",
  contributors = true,
}: {
  source?: "glb" | "extrude" | "shape";
  useModelMaterials?: boolean;
  quality?: "draft" | "balanced" | "high";
  contributors?: boolean;
} = {}) {
  vi.spyOn(CaptureScene.prototype, "prepare").mockResolvedValue(undefined);
  const settings = createSpatialScene();
  settings.reflections = { mode: "scene", quality };
  const layer = createLayer(source === "extrude" ? "text" : "rectangle", {
    id: "receiver",
    spatial: { ...createSpatialLayer(source), useModelMaterials },
  });
  // Genuine >500k-triangle prepared geometry, larger than every capture quality budget.
  const dense = new SphereGeometry(1, 720, 360);
  const material = new MeshStandardMaterial({ metalness: 1, roughness: 0.2 });
  const texture = new Texture();
  material.map = texture;
  const a = new Mesh(dense, material),
    b = new Mesh(dense, material),
    group = new Group();
  a.position.x = -0.5;
  b.position.x = 0.5;
  group.add(a, b);
  const resource = new SpatialResource(group, [], settings);
  resource.update(layer, settings, null, 16, 16);
  resource.material.metalness = 1;
  resource.material.roughness = 0.2;
  const sources: ReflectionSource[] = [{ layer, resource }];
  if (contributors) {
    const wall = createLayer("rectangle", { id: "wall", spatial: createSpatialLayer("box") });
    const native = new SpatialResource(
      new Mesh(new BoxGeometry(), new MeshStandardMaterial({ roughness: 1 })),
      [],
      settings,
    );
    sources.push({ layer: wall, resource: native });
  }
  const cache = new GpuResourceCache(64 * 1024 * 1024);
  const captured: { meshes: string[]; center: number[] }[] = [];
  const captureScene = vi.fn(
    async (scene: Scene, center: Vector3, _size: number, target: CubeRenderTarget | null) => {
      captured.push({
        meshes: scene.children
          .filter((node) => node instanceof Mesh && node.visible)
          .map((node) => node.name),
        center: center.toArray(),
      });
      return target ?? new CubeRenderTarget(256, { depthBuffer: false });
    },
  );
  const environments = { captureScene } as unknown as EnvironmentSources;
  const reflections = new SceneReflections(renderer, cache, environments);
  const page = createPage({ id: "admission", layers: sources.map((item) => item.layer) });
  const prepare = (options = {}, canContinue = () => true) =>
    reflections.prepare(page, settings, sources, null, options, canContinue, resource.scene);
  const value = {
    settings,
    sources,
    resource,
    a,
    b,
    material,
    texture,
    cache,
    captured,
    captureScene,
    reflections,
    prepare,
  };
  cleanups.push(() => {
    reflections.dispose();
    cache.clear();
    for (const source of sources) source.resource.dispose();
  });
  return value;
}
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  vi.restoreAllMocks();
});

for (const source of ["glb", "extrude", "shape"] as const)
  for (const useModelMaterials of source === "glb" ? [true, false] : [false])
    test(`${source} receivers omitted from capture retain scene probes (original materials: ${useModelMaterials})`, async () => {
      const f = fixture({ source, useModelMaterials });
      const original = f.a.material;
      const materialDisposed = vi.spyOn(f.material, "dispose");
      const textureDisposed = vi.spyOn(f.texture, "dispose");
      const geometryDisposed = vi.spyOn(f.a.geometry, "dispose");
      await f.prepare();
      expect(f.resource.inventory.triangles / 2).toBeGreaterThan(REFLECTION_BUDGETS.high.triangles);
      expect(f.reflections.stats()).toMatchObject({
        probes: 2,
        captures: 2,
        meshes: 1,
        triangles: 12,
        receivers: 2,
        omittedMeshes: 2,
      });
      expect(f.captured.every((capture) => capture.meshes.length === 1)).toBe(true);
      expect(f.a.material).not.toBe(original);
      const privateMaterial = boundNodeMaterial(f.a);
      expect(privateMaterial.envMap).toBeTruthy();
      expect(privateMaterial.map).toBe(useModelMaterials ? f.texture : f.resource.material.map);
      expect(f.reflections.stamp("receiver")).toBeTruthy();
      const key = "spatial:reflections:admission:balanced";
      const reflectionResource = f.cache.get<ReflectionResource>(key)!;
      expect(f.cache.stats().cacheBytes).toBe(reflectionResource.bytes);
      expect(f.cache.stats().cacheBytes).toBeLessThan(f.cache.maxBytes);
      const privateDisposed = vi.spyOn(privateMaterial, "dispose");
      f.reflections.dispose();
      expect(f.a.material).toBe(original);
      expect(privateDisposed).toHaveBeenCalledOnce();
      expect(materialDisposed).not.toHaveBeenCalled();
      expect(textureDisposed).not.toHaveBeenCalled();
      expect(geometryDisposed).not.toHaveBeenCalled();
    });

for (const quality of ["draft", "balanced", "high"] as const)
  test(`${quality} retains bounded receiver probes with no capture contributors`, async () => {
    const f = fixture({ quality, contributors: false });
    await f.prepare();
    const probes = Math.min(2, REFLECTION_BUDGETS[quality].probes);
    expect(f.reflections.stats()).toMatchObject({
      probes,
      captures: probes,
      meshes: 0,
      triangles: 0,
      receivers: 2,
      omittedMeshes: 2,
    });
    expect(f.captured.every((capture) => capture.meshes.length === 0)).toBe(true);
    await f.prepare();
    expect(f.reflections.stats()?.captures).toBe(0);
  });

test("moving an omitted probe receiver invalidates its position while preview and playback retain bounded cadence", async () => {
  const f = fixture();
  let now = 1000,
    idle = true,
    ready = 0;
  vi.spyOn(performance, "now").mockImplementation(() => now);
  const listeners = new Set<() => void>();
  const backgroundGpu = {
    read: () => idle,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    ready: () => {
      ready++;
    },
  };
  await f.prepare({ mediaMode: "exact", backgroundGpu });
  const first = f.captured[0]!.center;
  f.a.position.y = 0.4;
  idle = false;
  await f.prepare({ mediaMode: "preview", backgroundGpu });
  expect(f.reflections.stats()).toMatchObject({ captures: 0, deferred: true, receivers: 2 });
  idle = true;
  for (const listener of listeners) listener();
  expect(ready).toBe(1);
  now += 40;
  await f.prepare({ mediaMode: "playback", backgroundGpu });
  expect(f.reflections.stats()).toMatchObject({ captures: 0, deferred: true });
  // Exact samples are independent of playback cadence and the active gesture gate.
  idle = false;
  await f.prepare({ mediaMode: "exact", backgroundGpu });
  expect(f.reflections.stats()).toMatchObject({ captures: 2, deferred: false });
  expect(f.captured[2]!.center).not.toEqual(first);
  f.reflections.dispose();
  expect(listeners.size).toBe(0);
});

test("cancelled captures restore self exclusion, preserve originals and account completed allocations", async () => {
  const f = fixture();
  let active = true;
  f.captureScene.mockImplementationOnce(async () => {
    active = false;
    return new CubeRenderTarget(256, { depthBuffer: false });
  });
  const original = f.a.material;
  await expect(f.prepare({}, () => active)).rejects.toMatchObject({ name: "AbortError" });
  const resource = f.cache.get<ReflectionResource>("spatial:reflections:admission:balanced")!;
  expect(resource.capture.hidden).toBeNull();
  expect(resource.signature).toBe("");
  expect(f.a.material).toBe(original);
  expect(f.cache.stats().cacheBytes).toBe(resource.bytes);
  active = true;
  await f.prepare({}, () => active);
  expect(f.reflections.stats()).toMatchObject({ captures: 2, receivers: 2 });
});

test("capture admission keeps exact mesh and triangle limits and excludes only the selected proxy", () => {
  const f = fixture();
  const source = f.sources[1]!;
  const items = enumerateMeshes(source, new Matrix4(), 1);
  const item = items[0]!;
  const many = [item, { ...item, key: "second" }, { ...item, key: "third" }];
  const { admitted, omitted, triangles } = admitMeshes(many, {
    ...REFLECTION_BUDGETS.balanced,
    meshes: 2,
    triangles: 24,
  });
  expect({ count: admitted.length, omitted, triangles }).toEqual({
    count: 2,
    omitted: 1,
    triangles: 24,
  });
  const capture = new CaptureScene();
  try {
    capture.sync(admitted, source.resource.scene, f.settings, null);
    const proxies = capture.scene.children.filter((node) => node instanceof Mesh);
    capture.hide(item.key);
    expect(proxies.filter((node) => node.visible)).toHaveLength(1);
    capture.show();
    expect(proxies.every((node) => node.visible)).toBe(true);
  } finally {
    capture.dispose();
  }
});
