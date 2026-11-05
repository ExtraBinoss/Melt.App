import { expect, test, vi } from "vitest";
import { Color, Mesh, Vector3 } from "three/webgpu";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { spatialEnvironment } from "@musart/core";
import { createProceduralEnvironment } from "../../src/spatial/procedural-environment";

test("native environment lightboxes retain HDR radiance and face their capture origin", () => {
  const preset = spatialEnvironment("neonStrip");
  const environment = createProceduralEnvironment(preset);
  const meshes = environment.scene.children.filter((node) => node instanceof Mesh);
  expect(meshes).toHaveLength(preset.panels.length + 1);
  expect(meshes[0]!.scale.toArray()).toEqual(preset.roomSize);
  for (const [index, panel] of preset.panels.entries()) {
    const mesh = meshes[index + 1]!;
    expect(mesh.position.toArray()).toEqual(panel.position);
    expect(mesh.scale.toArray()).toEqual([...panel.size, 1]);
    const direction = mesh.getWorldDirection(new Vector3());
    expect(direction.dot(mesh.position.clone().negate().normalize())).toBeCloseTo(1, 5);
    const material = Array.isArray(mesh.material) ? mesh.material[0]! : mesh.material;
    expect(
      "color" in material &&
        material.color instanceof Color &&
        Math.max(...material.color.toArray()),
    ).toBeGreaterThan(1);
  }
  environment.dispose();
});

test("scene preparation disposes each owned geometry and material exactly once", () => {
  const environment = createProceduralEnvironment(spatialEnvironment("studioHalo"));
  const geometries = new Set(),
    materials = new Set();
  const geometryDisposals = vi.fn(),
    materialDisposals = vi.fn();
  environment.scene.traverse((node) => {
    if (!(node instanceof Mesh)) return;
    if (!geometries.has(node.geometry)) {
      geometries.add(node.geometry);
      node.geometry.addEventListener("dispose", geometryDisposals);
    }
    for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
      materials.add(material);
      material.addEventListener("dispose", materialDisposals);
    }
  });
  environment.dispose();
  expect(geometryDisposals).toHaveBeenCalledTimes(2);
  expect(materialDisposals).toHaveBeenCalledTimes(materials.size);
  expect(environment.scene.children).toHaveLength(0);
});

test.each([
  ["studio", "#FFFFFF"],
  ["softbox", "#EEEEFF"],
  ["overcast", "#D3DBE6"],
  ["sunset", "#FFB781"],
  ["dawn", "#E0C6FF"],
  ["night", "#8D9AD8"],
  ["neon", "#D59BFF"],
  ["warm", "#FFE1BC"],
  ["cool", "#BDDDFF"],
  ["gallery", "#F2ECE5"],
  ["contrast", "#AAAAAA"],
])("legacy %s preserves the original native room and tint", (id, tintValue) => {
  const baseline = new RoomEnvironment();
  const environment = createProceduralEnvironment(spatialEnvironment(id));
  try {
    expect(environment.scene).toBeInstanceOf(RoomEnvironment);
    expect(environment.scene.position.toArray()).toEqual(baseline.position.toArray());
    expect(environment.scene.children).toHaveLength(baseline.children.length);
    for (const [index, source] of baseline.children.entries()) {
      const actual = environment.scene.children[index]!;
      expect(actual.type).toBe(source.type);
      expect(actual.position.toArray()).toEqual(source.position.toArray());
      expect(actual.rotation.toArray()).toEqual(source.rotation.toArray());
      expect(actual.scale.toArray()).toEqual(source.scale.toArray());
      if (source instanceof Mesh && actual instanceof Mesh) {
        expect(Array.from(actual.geometry.getAttribute("position").array)).toEqual(
          Array.from(source.geometry.getAttribute("position").array),
        );
        const sourceMaterials = Array.isArray(source.material)
          ? source.material
          : [source.material];
        const actualMaterials = Array.isArray(actual.material)
          ? actual.material
          : [actual.material];
        for (const [materialIndex, sourceMaterial] of sourceMaterials.entries()) {
          const actualMaterial = actualMaterials[materialIndex]!;
          expect(actualMaterial.type).toBe(sourceMaterial.type);
          if (
            "color" in sourceMaterial &&
            sourceMaterial.color instanceof Color &&
            "color" in actualMaterial &&
            actualMaterial.color instanceof Color
          )
            expect(actualMaterial.color.toArray()).toEqual(
              sourceMaterial.color.clone().multiply(new Color(tintValue)).toArray(),
            );
          if (
            "emissive" in sourceMaterial &&
            sourceMaterial.emissive instanceof Color &&
            "emissive" in actualMaterial &&
            actualMaterial.emissive instanceof Color
          )
            expect(actualMaterial.emissive.toArray()).toEqual(sourceMaterial.emissive.toArray());
        }
      }
      if ("intensity" in source && "intensity" in actual)
        expect(actual.intensity).toBe(source.intensity);
    }
  } finally {
    environment.dispose();
    baseline.dispose();
  }
});

test("legacy room cleanup disposes all native shared resources once", () => {
  const environment = createProceduralEnvironment(spatialEnvironment("studio"));
  const resources = new Set<{ dispose(): void }>();
  environment.scene.traverse((node) => {
    if (!(node instanceof Mesh)) return;
    resources.add(node.geometry);
    for (const material of Array.isArray(node.material) ? node.material : [node.material])
      resources.add(material);
  });
  const disposals = [...resources].map((resource) => vi.spyOn(resource, "dispose"));
  environment.dispose();
  expect(disposals.length).toBeGreaterThan(2);
  for (const dispose of disposals) expect(dispose).toHaveBeenCalledExactlyOnceWith();
});
