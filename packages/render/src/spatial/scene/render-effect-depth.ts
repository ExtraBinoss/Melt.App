import {
  Color,
  type Group,
  type Matrix4,
  type Mesh,
  type RenderTarget,
  type Scene,
  type WebGPURenderer,
} from "three/webgpu";
import type { SpatialCamera } from "../camera";
import type { ReflectionSource } from "../reflections/model";
import type { DepthBindings } from "./DepthBindings";

/** Draw actual borrowed meshes into a private depth attachment. No source clones,
 * GPU readback, colour effects or post-composite masks enter native depth.
 */
export function renderEffectDepth(
  renderer: WebGPURenderer,
  scene: Scene,
  camera: SpatialCamera,
  output: RenderTarget,
  projection: Matrix4,
  bindings: DepthBindings,
  meshes: ReadonlyMap<Mesh, string>,
  anchors: ReadonlyMap<string, Group>,
  sources: ReadonlyMap<string, ReflectionSource>,
  visible: (id: string) => boolean,
  writes: (id: string) => boolean,
) {
  const target = renderer.getRenderTarget(),
    face = renderer.getActiveCubeFace(),
    mip = renderer.getActiveMipmapLevel(),
    auto = renderer.autoClear,
    alpha = renderer.getClearAlpha(),
    color = renderer.getClearColor(new Color()),
    previous = camera.projectionMatrix.clone(),
    inverse = camera.projectionMatrixInverse.clone(),
    roots = new Map([...sources].map(([id, source]) => [id, source.resource.root.visible])),
    anchorVisibility = new Map([...anchors].map(([id, anchor]) => [id, anchor.visible]));
  try {
    renderer.autoClear = true;
    renderer.setClearColor(0, 0);
    for (const [id, anchor] of anchors) anchor.visible = visible(id);
    for (const [id, source] of sources) source.resource.root.visible = visible(id);
    bindings.bind(meshes.keys(), "depth", (mesh) => writes(meshes.get(mesh)!));
    camera.projectionMatrix.copy(projection);
    camera.projectionMatrixInverse.copy(projection).invert();
    renderer.setRenderTarget(output);
    renderer.render(scene, camera);
  } finally {
    bindings.restore();
    for (const [id, source] of sources) source.resource.root.visible = roots.get(id)!;
    for (const [id, anchor] of anchors) anchor.visible = anchorVisibility.get(id)!;
    camera.projectionMatrix.copy(previous);
    camera.projectionMatrixInverse.copy(inverse);
    renderer.setRenderTarget(target, face, mip);
    renderer.autoClear = auto;
    renderer.setClearColor(color, alpha);
  }
}
