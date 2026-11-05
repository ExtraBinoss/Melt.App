import { expect, test } from "vitest";
import {
  createLayer,
  createPage,
  createProject,
  createSpatialLayer,
  createSpatialScene,
  type Layer,
} from "@musart/core";
import { PaintPreviewLineage } from "../../../src/canvas/session/preview-lineage";
import type { PreviewValue } from "../../../src/state/session/preview-source";

test("certifies contiguous background/layer paint samples, retiring every scope and source boundary", () => {
  const layer = createLayer("rectangle", { id: "paint" });
  const page = createPage({ layers: [layer] });
  const project = createProject({ pages: [page] });
  const selection = [layer.id];
  const lineage = new PaintPreviewLineage();
  const read = (preview: PreviewValue | null) => lineage.read(project, page, selection, preview);
  const first = read({ target: "page", patch: { background: "#123456" } });
  expect(first).toBeDefined();
  expect(read({ target: "page", patch: { background: "#654321" } })).toBe(first);
  expect(read(null)).toBeUndefined();
  const compositionEffects = read({ target: "page", patch: { effects: [] } });
  expect(compositionEffects).toBeDefined();
  expect(read({ target: "page", patch: { effects: [] } })).toBe(compositionEffects);
  const next = read({ target: "page", patch: { background: "#123456" } });
  expect(next).not.toBe(first);
  const fill = { target: "layer", layerId: layer.id, patch: { fill: "#123456" } } as const;
  const token = read(fill);
  expect(read({ ...fill, patch: { fill: "#654321" } })).toBe(token);
  expect(lineage.read(project, page, [...selection], fill)).not.toBe(token);
  const beforeSource = read(fill);
  expect(lineage.read(project, { ...page }, selection, fill)).not.toBe(beforeSource);
  const beforeProject = read(fill);
  expect(lineage.read({ ...project }, page, selection, fill)).not.toBe(beforeProject);
  const beforeProperty = read(fill);
  expect(read({ ...fill, patch: { stroke: "#123456" } })).not.toBe(beforeProperty);
  for (const preview of [
    { target: "page", patch: { width: 200 } },
    { target: "layer", layerId: layer.id, patch: { fill: "#123456", x: 20 } },
    { target: "layer", layerId: "missing", patch: { fill: "#123456" } },
    { target: "layers", layerIds: [], patch: { fill: "#123456" } },
  ] satisfies PreviewValue[])
    expect(read(preview)).toBeUndefined();
  expect(read({ target: "layer", layerId: layer.id, patch: { effects: [] } })).toBeDefined();
  expect(
    read({ target: "layers", layerIds: [layer.id], patch: { fillGradient: undefined } }),
  ).toBeDefined();
});

test("keeps text, typography, native geometry/material and scene drafts live until their scope ends", () => {
  const spatial = createSpatialLayer("extrude");
  const layer = createLayer("text", { id: "native-text", spatial });
  const page = createPage({ layers: [layer] });
  const project = createProject({ pages: [page] });
  const lineage = new PaintPreviewLineage();
  const selection = [layer.id];
  const read = (patch: Partial<Layer>) =>
    lineage.read(project, page, selection, { target: "layer", layerId: layer.id, patch });
  for (const key of [
    "text",
    "fontFamily",
    "fontSize",
    "fontWeight",
    "lineHeight",
    "letterSpacing",
    "textAlign",
  ] as const) {
    const token = read({ [key]: layer[key] });
    expect(token).toBeDefined();
    expect(read({ [key]: layer[key] })).toBe(token);
  }
  const native = read({ spatial: { ...spatial, depth: 0.1 } });
  expect(native).toBeDefined();
  expect(read({ spatial: { ...spatial, depth: 0.2, bevel: 0.01 } })).toBe(native);
  expect(read({ spatial: { ...spatial, material: { ...spatial.material, metalness: 0.7 } } })).toBe(
    native,
  );
  expect(read({ spatial: createSpatialLayer("box") })).not.toBe(native);
  expect(read({ spatial: { ...spatial, enabled: false } })).not.toBe(native);
  const scene = createSpatialScene();
  const sceneToken = lineage.read(project, page, selection, {
    target: "page",
    patch: { spatial: scene },
  });
  expect(sceneToken).toBeDefined();
  expect(
    lineage.read(project, page, selection, {
      target: "page",
      patch: { spatial: { ...scene, camera: { ...scene.camera, yaw: 30 } } },
    }),
  ).toBe(sceneToken);
  expect(lineage.read(project, page, selection, null)).toBeUndefined();
  expect(read({ spatial })).not.toBe(native);
});
