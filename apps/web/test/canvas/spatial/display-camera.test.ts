import { expect, test } from "vitest";
import { OrthographicCamera, PerspectiveCamera, Vector3 } from "three/webgpu";
import { applyStudioCameraWindow } from "../../../src/canvas/spatial/display-camera";

test.each([new PerspectiveCamera(35, 16 / 9), new OrthographicCamera(-2, 2, 1.125, -1.125)])(
  "expanded editor projection preserves canonical world proportions (%s)", (camera) => {
    camera.position.z = 5; camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
    const point = new Vector3(.5, .3, 0);
    const before = point.clone().project(camera);
    const width = 1920, height = 1080;
    const region = { x: -240, y: -700, width: 2400, height: 2480 };
    applyStudioCameraWindow(camera, { width, height }, region);
    const after = point.clone().project(camera);
    expect((after.x + 1) / 2 * region.width + region.x).toBeCloseTo((before.x + 1) / 2 * width);
    expect((1 - after.y) / 2 * region.height + region.y).toBeCloseTo((1 - before.y) / 2 * height);
    expect(after.clone().unproject(camera).distanceTo(point)).toBeLessThan(1e-8);
  },
);
