import type { Bounds, Composition } from "@musart/core";
import type { FrameTexture } from "@musart/render";
import type { Mesh, OrthographicCamera, TextureNode } from "three/webgpu";

/** One-to-one transport of an expanded display texture without resizing canonical sources. */
export function bindDisplayPlane(
  sample: TextureNode<"vec4">,
  mesh: Mesh,
  camera: OrthographicCamera,
  page: Composition,
  frame: FrameTexture,
  viewport?: Bounds,
) {
  const region = viewport ?? { x: 0, y: 0, width: page.width, height: page.height };
  sample.value = frame.texture;
  mesh.scale.set(region.width, region.height, 1);
  camera.left = -region.width / 2;
  camera.right = region.width / 2;
  camera.top = region.height / 2;
  camera.bottom = -region.height / 2;
  camera.updateProjectionMatrix();
}
