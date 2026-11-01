import { expect, test, vi } from "vitest";
import { createLayer, createPage } from "@musart/core";
import { frameGeometry, sourceGeometry } from "../../../src/canvas/selection/frame-geometry";

test("the shared presented frame reuses ID/world geometry without broad queries or repeated draft scans", () => {
  const layer = createLayer("rectangle", { id: "shape", x: 1, y: 2 });
  let frame = { page: createPage({ layers: [layer] }) };
  const source = { read: () => frame };
  const geometry = sourceGeometry(source);
  const query = vi.spyOn(geometry, "queryBounds");
  expect(sourceGeometry(source)).toBe(geometry);
  expect(frameGeometry(frame)).toBe(geometry);
  expect(geometry.orderedLayers(["shape", "missing", "shape"])).toEqual([layer]);
  expect(geometry.byId.get("shape")).toBe(layer);
  expect(query).not.toHaveBeenCalled();
  const before = frame;
  frame = { page: { ...frame.page, layers: [{ ...layer, x: 50 }] } };
  expect(sourceGeometry(source)).not.toBe(geometry);
  expect(sourceGeometry(source).worldBounds("shape").x).toBe(50);
  expect(frameGeometry(before).worldBounds("shape").x).toBe(1);
});
