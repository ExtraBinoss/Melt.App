import { expect, test } from "vitest";
import { createLayer, createPage, createProject } from "@musart/core";
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
    { target: "layer", layerId: layer.id, patch: { effects: [] } },
    { target: "layer", layerId: "missing", patch: { fill: "#123456" } },
    { target: "layers", layerIds: [], patch: { fill: "#123456" } },
  ] satisfies PreviewValue[])
    expect(read(preview)).toBeUndefined();
  expect(
    read({ target: "layers", layerIds: [layer.id], patch: { fillGradient: undefined } }),
  ).toBeDefined();
});
