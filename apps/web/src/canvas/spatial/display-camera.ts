import { Matrix4 } from "three/webgpu";
import type { Camera } from "three/webgpu";
import type { Bounds } from "@musart/core";

/** Present the canonical camera through an expanded editor window, without changing its world. */
export function applyStudioCameraWindow(
  camera: Camera,
  page: { width: number; height: number },
  region: Bounds,
) {
  camera.projectionMatrix.premultiply(new Matrix4().set(
    page.width / region.width, 0, 0, (page.width - 2 * region.x) / region.width - 1,
    0, page.height / region.height, 0, 1 - (page.height - 2 * region.y) / region.height,
    0, 0, 1, 0,
    0, 0, 0, 1,
  ));
  camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
}
