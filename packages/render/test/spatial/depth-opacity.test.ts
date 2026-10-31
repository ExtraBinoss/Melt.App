import { expect, test, vi } from "vitest";
import { createLayer, createPage, createSpatialLayer } from "@musart/core";
import {
  BoxGeometry,
  Mesh,
  MeshStandardNodeMaterial,
  Scene,
  Texture,
  WebGPUCoordinateSystem,
  type WebGPURenderer,
} from "three/webgpu";
import { DepthScopes } from "../../src/spatial/scene/DepthScopes";
import { DepthBindings } from "../../src/spatial/scene/DepthBindings";

const source = (id: string, parentId: string | null = null, opacity = 1) =>
  createLayer("rectangle", { id, parentId, opacity, spatial: createSpatialLayer("box") });

test("fractional layers never hold out rear color, while full opacity and selection context retain native depth", () => {
  const plan = new DepthScopes(
    createPage({
      layers: [
        source("opaque"),
        source("half", null, 0.5),
        source("zero", null, 0),
        { ...source("context"), spatialContext: true },
        { ...source("mask"), maskSource: true },
        { ...source("hidden"), visible: false },
      ],
    }),
  );
  expect(plan.scope("half")).toBe("");
  for (const id of ["opaque", "context"]) expect(plan.writes(id, "")).toBe(true);
  for (const id of ["half", "zero", "mask", "hidden"]) expect(plan.writes(id, "")).toBe(false);
});

test("faded groups keep internal opaque sibling occlusion and isolate nested faded groups", () => {
  const plan = new DepthScopes(
    createPage({
      layers: [
        source("outside"),
        createLayer("group", { id: "fade", opacity: 0.5 }),
        source("near", "fade"),
        source("far", "fade"),
        source("partial", "fade", 0.4),
        createLayer("group", { id: "nested", parentId: "fade", opacity: 0.5 }),
        source("nested-near", "nested"),
        source("nested-far", "nested"),
        createLayer("group", { id: "other", opacity: 0.5 }),
        source("other-child", "other"),
      ],
    }),
  );
  expect(plan.scope("near")).toBe("fade");
  expect(plan.scope("nested-near")).toBe("nested");
  expect(plan.writes("near", "")).toBe(false);
  for (const id of ["outside", "near", "far"]) {
    expect(plan.writes(id, "fade")).toBe(true);
    expect(plan.writes(id, "nested")).toBe(true);
  }
  expect(plan.writes("nested-near", "fade")).toBe(false);
  expect(plan.writes("nested-near", "nested")).toBe(true);
  expect(plan.writes("nested-far", "nested")).toBe(true);
  expect(plan.writes("other-child", "nested")).toBe(false);
  expect(plan.writes("partial", "fade")).toBe(false);
});

test("scoped depth copies never change borrowed/shared materials or their native material alpha", () => {
  const renderer = {
    coordinateSystem: WebGPUCoordinateSystem,
    library: { fromMaterial: (base: MeshStandardNodeMaterial) => base },
  } as unknown as WebGPURenderer;
  const base = new MeshStandardNodeMaterial();
  const geometry = new BoxGeometry();
  const a = new Mesh(geometry, base),
    b = new Mesh(geometry, base);
  const scene = new Scene();
  scene.add(a, b);
  const texture = new Texture();
  const bindings = new DepthBindings(renderer, texture);
  try {
    bindings.apply(scene, "depth", (mesh) => mesh === a);
    expect(a.material.depthWrite).toBe(true);
    expect(b.material.depthWrite).toBe(false);
    expect(a.material).not.toBe(b.material);
    expect(base.depthWrite).toBe(true);
    bindings.restore();
    expect(a.material).toBe(base);
    expect(b.material).toBe(base);
    base.opacity = 0.5;
    bindings.apply(scene, "depth");
    expect(a.material.depthWrite).toBe(false);
    bindings.apply(scene, "color");
    expect(a.material.opacity).toBe(0.5);
    const copy = a.material;
    const disposed = vi.spyOn(copy, "dispose");
    bindings.restore();
    bindings.prune(new Set());
    expect(disposed).toHaveBeenCalledOnce();
    expect(bindings.bytes).toBe(0);
    expect(base.opacity).toBe(0.5);
  } finally {
    bindings.dispose();
    geometry.dispose();
    base.dispose();
    texture.dispose();
  }
});
