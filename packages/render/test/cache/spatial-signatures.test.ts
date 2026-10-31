import { expect, it } from "vitest";
import {
  createEffect,
  createLayer,
  createPage,
  createSpatialLayer,
  createSpatialScene,
  type Composition,
} from "@musart/core";
import {
  createSpatialDependencySignatures,
  type SpatialSignatureSource,
} from "../../src/cache/spatial-signatures";
import { SourceIdentities } from "../../src/cache/source-identities";
import { createSourceKeys } from "../../src/cache/keys";
import { morphFixture } from "../morph-fixture";
const identities = new SourceIdentities(512, 2 * 1024 * 1024);
const matrix = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
function fixture() {
  const spatial = createSpatialScene();
  spatial.reflections!.mode = "environment";
  return createPage({
    width: 256,
    height: 256,
    spatial,
    layers: ["a", "b"].map((id) =>
      createLayer("rectangle", { id, fill: "#ffffff", spatial: createSpatialLayer("box") }),
    ),
  });
}
function signatures(page: Composition) {
  return createSpatialDependencySignatures(
    page,
    page.spatial!,
    page.layers.map((layer) => ({
      layer,
      contentIdentity: layer.id,
      worldMatrix: matrix,
      visible: layer.visible,
      inheritedOpacity: [],
    })),
    null,
    (signature) => identities.intern(signature),
  );
}
it("an opaque appearance edit preserves geometry/depth/shadows and the other source with probes disabled", () => {
  const page = fixture(),
    initial = signatures(page);
  const changed = signatures({
    ...page,
    layers: page.layers.map((layer) =>
      layer.id === "a"
        ? {
            ...layer,
            fill: "#ff0000",
            spatial: {
              ...layer.spatial!,
              material: { ...layer.spatial!.material, roughness: 0.8 },
            },
          }
        : layer,
    ),
  });
  expect(changed.geometry).toBe(initial.geometry);
  expect(changed.depth).toBe(initial.depth);
  expect(changed.shadows).toBe(initial.shadows);
  expect(changed.source("b")).toBe(initial.source("b"));
  expect(changed.source("a")).not.toBe(initial.source("a"));
  expect(changed.probes).not.toBe(initial.probes);
});
it("scene reflections recapture changed neighbour appearance and invalidate receiver color", () => {
  const base = fixture(),
    page = {
      ...base,
      spatial: {
        ...base.spatial!,
        reflections: { mode: "scene" as const, quality: "draft" as const },
      },
    };
  const initial = signatures(page),
    changed = signatures({
      ...page,
      layers: [{ ...page.layers[0]!, fill: "#00ff00" }, page.layers[1]!],
    });
  expect(changed.depth).toBe(initial.depth);
  expect(changed.probes).not.toBe(initial.probes);
  expect(changed.source("b")).not.toBe(initial.source("b"));
});
it("coverage, skin animation, geometry and affine pose remain conservative neighbour dependencies", () => {
  const page = fixture(),
    initial = signatures(page);
  const source = page.layers[0]!;
  for (const patch of [
    { fill: "#ffffff80" },
    { opacity: 0.5 },
    { affine: [1, 0.2, 0, 1] as [number, number, number, number] },
    { spatial: { ...source.spatial!, clipTime: 1 } },
    { spatial: { ...source.spatial!, depth: 2 } },
    {
      spatial: { ...source.spatial!, material: { ...source.spatial!.material, transmission: 0.5 } },
    },
  ]) {
    const changed = signatures({ ...page, layers: [{ ...source, ...patch }, page.layers[1]!] });
    expect(changed.depth).not.toBe(initial.depth);
    expect(changed.source("b")).not.toBe(initial.source("b"));
  }
});
it("post-composite effects change final compositing without rebuilding source geometry or opaque depth", () => {
  const page = fixture(),
    initial = signatures(page);
  const changed = signatures({
    ...page,
    layers: [{ ...page.layers[0]!, blendMode: "multiply" }, page.layers[1]!],
  });
  expect(changed.geometry).toBe(initial.geometry);
  expect(changed.depth).toBe(initial.depth);
  expect(changed.source("b")).toBe(initial.source("b"));
  expect(changed.composite).not.toBe(initial.composite);
});

it("camera orbit changes projected color/depth while retaining world capture and shadow inputs", () => {
  const page = fixture(),
    initial = signatures(page);
  const changed = signatures({
    ...page,
    spatial: { ...page.spatial!, camera: { ...page.spatial!.camera, yaw: 80 } },
  });
  expect(changed.world).toBe(initial.world);
  expect(changed.probes).toBe(initial.probes);
  expect(changed.shadows).toBe(initial.shadows);
  expect(changed.projection).not.toBe(initial.projection);
  expect(changed.depth).not.toBe(initial.depth);
  expect(changed.source("b")).not.toBe(initial.source("b"));
});
it("light pose changes shadow/probe inputs, while light color retains shadow-map inputs", () => {
  const base = fixture(),
    page = { ...base, spatial: { ...base.spatial!, shadows: true } };
  const initial = signatures(page);
  const move = signatures({
    ...page,
    spatial: {
      ...page.spatial,
      lights: page.spatial.lights.map((light) => ({ ...light, x: light.x + 1 })),
    },
  });
  expect(move.depth).toBe(initial.depth);
  expect(move.shadows).not.toBe(initial.shadows);
  expect(move.probes).not.toBe(initial.probes);
  const paint = signatures({
    ...page,
    spatial: {
      ...page.spatial,
      lights: page.spatial.lights.map((light) => ({ ...light, color: "#00ff00" })),
    },
  });
  expect(paint.shadows).toBe(initial.shadows);
  expect(paint.probes).not.toBe(initial.probes);
});

it("switching GLB original/override materials invalidates native coverage and neighbour surfaces", () => {
  const base = fixture();
  const layer = {
    ...base.layers[0]!,
    spatial: { ...createSpatialLayer("glb"), useModelMaterials: false },
  };
  const page = { ...base, layers: [layer, base.layers[1]!] };
  const before = signatures(page);
  const after = signatures({
    ...page,
    layers: [{ ...layer, spatial: { ...layer.spatial, useModelMaterials: true } }, base.layers[1]!],
  });
  expect(after.depth).not.toBe(before.depth);
  expect(after.shadows).not.toBe(before.shadows);
  expect(after.source("b")).not.toBe(before.source("b"));
});

it("serializes shared dependency payloads once and keeps aggregate source key bytes linear", () => {
  const measure = (count: number) => {
    const page = fixture();
    page.spatial!.reflections!.mode = "scene";
    const inputs: SpatialSignatureSource[] = Array.from({ length: count }, (_, index) => ({
      layer: createLayer("rectangle", {
        id: `source-${index}`,
        spatial: createSpatialLayer("box"),
      }),
      contentIdentity: `large-prepared-geometry:${"x".repeat(4096)}:${index}`,
      worldMatrix: matrix,
      visible: true,
      inheritedOpacity: [],
    }));
    const identities = new SourceIdentities(1024, 8 * 1024 * 1024);
    const sharedPayloads: string[] = [];
    const result = createSpatialDependencySignatures(
      page,
      page.spatial!,
      inputs,
      null,
      (signature) => {
        sharedPayloads.push(signature);
        return identities.intern(signature);
      },
    );
    const keys = inputs.map(({ layer }) => result.source(layer.id)!);
    expect(sharedPayloads).toHaveLength(5);
    expect(sharedPayloads.filter((payload) => payload === result.depth)).toHaveLength(1);
    expect(sharedPayloads.filter((payload) => payload === result.shadows)).toHaveLength(1);
    expect(sharedPayloads.filter((payload) => payload === result.probes)).toHaveLength(1);
    // Each key contains its own local input plus compact shared IDs, independent of sibling count.
    expect(
      keys.every((key, index) => key.length < inputs[index]!.contentIdentity.length + 2000),
    ).toBe(true);
    expect(identities.stats().bytes).toBeLessThanOrEqual(8 * 1024 * 1024);
    return {
      keyBytes: keys.reduce((bytes, key) => bytes + key.length * 2, 0),
      sharedBytes: sharedPayloads.reduce((bytes, payload) => bytes + payload.length * 2, 0),
    };
  };
  const small = measure(8),
    large = measure(64);
  expect(large.keyBytes).toBeGreaterThan(small.keyBytes * 7);
  expect(large.keyBytes).toBeLessThan(small.keyBytes * 9);
  expect(large.sharedBytes).toBeLessThan(small.sharedBytes * 9);
});

it("compacts immutable morph contours while replacements invalidate the owner and composition", () => {
  const base = fixture(),
    shape = morphFixture();
  const points = Array.from({ length: 4096 }, (_, index) => [index / 4096, 0] as const);
  let payloadReads = 0;
  Object.defineProperty(shape.shapes[0]!.frames[0]!.contours[0]!, "points", {
    enumerable: true,
    get() {
      payloadReads++;
      return points;
    },
  });
  const effect = createEffect("morph", { shapeMorph: shape });
  const page = { ...base, layers: [{ ...base.layers[0]!, effects: [effect] }, base.layers[1]!] };
  const before = signatures(page),
    repeated = signatures(page);
  const beforeKeys = createSourceKeys(page, {}, 1);
  const ownerKey = beforeKeys(page.layers[0]!),
    neighbourKey = beforeKeys(page.layers[1]!);
  const replacement = {
    ...page,
    layers: [
      { ...page.layers[0]!, effects: [{ ...effect, shapeMorph: morphFixture() }] },
      page.layers[1]!,
    ],
  };
  const after = signatures(replacement),
    afterKeys = createSourceKeys(replacement, {}, 1);
  expect(payloadReads).toBe(0);
  expect(before.composite.length).toBeLessThan(2000);
  expect(repeated.composite).toBe(before.composite);
  expect(after.composite).not.toBe(before.composite);
  expect(afterKeys(replacement.layers[0]!)).not.toBe(ownerKey);
  expect(afterKeys(replacement.layers[1]!)).toBe(neighbourKey);
  expect(after.depth).toBe(before.depth);
  expect(after.shadows).toBe(before.shadows);
});

it("keeps raw depth/shadow equality when a bounded interner evicts compact identities", () => {
  const page = fixture(),
    identities = new SourceIdentities(1, 40);
  const inputs = page.layers.map((layer) => ({
    layer,
    contentIdentity: layer.id,
    worldMatrix: matrix,
    visible: true,
    inheritedOpacity: [],
  }));
  const compute = () =>
    createSpatialDependencySignatures(page, page.spatial!, inputs, null, (signature) =>
      identities.intern(signature),
    );
  const before = compute(),
    after = compute();
  expect(after.depth).toBe(before.depth);
  expect(after.shadows).toBe(before.shadows);
  // Eviction produces a safe miss instead of recycling another source's identity.
  expect(after.source("a")).not.toBe(before.source("a"));
  expect(identities.stats().bytes).toBeLessThanOrEqual(40);
});
