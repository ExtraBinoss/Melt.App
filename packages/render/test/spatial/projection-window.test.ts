import { expect, test } from "vitest";
import { createLayer, createPage, SpatialGeometry } from "@musart/core";
import { BoxGeometry, Mesh, MeshBasicMaterial, OrthographicCamera, Vector3 } from "three/webgpu";
import { projectedTransport, windowProjection } from "../../src/spatial/scene/projection";

test("source crops extend to the display window while retaining canonical projection and local coordinates", () => {
  const layer = createLayer("rectangle", { x: 0, y: 0, width: 256, height: 256 });
  const page = createPage({ width: 256, height: 256, layers: [layer] });
  const geometry = new SpatialGeometry(page);
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  camera.position.z = 10;
  camera.updateMatrixWorld(true);
  const mesh = new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial());
  mesh.position.x = -1.5;
  mesh.updateMatrixWorld(true);
  const viewport = { x: -256, y: -128, width: 768, height: 512 };
  try {
    const canonical = camera.projectionMatrix.clone();
    const original = projectedTransport(page, layer, mesh, camera, geometry);
    const expanded = projectedTransport(page, layer, mesh, camera, geometry, viewport);
    expect(original.x).toBe(-2);
    expect(original.width).toBeLessThan(10);
    expect(expanded.x).toBeLessThan(-100);
    expect(expanded.width).toBeGreaterThan(100);
    expect(camera.projectionMatrix.equals(canonical)).toBe(true);
    const mapping = windowProjection(page, viewport);
    const topLeft = new Vector3(-1, 1, 0).applyMatrix4(mapping);
    expect(topLeft.x).toBeCloseTo(-1 / 3);
    expect(topLeft.y).toBeCloseTo(0.5);
  } finally {
    mesh.geometry.dispose();
    mesh.material.dispose();
  }
});
