import {
  Matrix4,
  Mesh,
  MeshBasicNodeMaterial,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  Vector2,
  type Camera,
  type Node,
  type WebGPURenderer,
} from "three/webgpu";
import { texture, uniform, uv, vec2, vec4 } from "three/tsl";
import type { SpatialResource } from "./SpatialResource";

/** Display-only contour of the retained native coverage, including glyph counters,
 * skinned meshes and shared-depth occlusion. Borrows its texture; owns no GPU target. */
export class SpatialSelectionContour {
  private readonly material = new MeshBasicNodeMaterial({
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  private readonly geometry = new PlaneGeometry(2, 2);
  private readonly mesh = new Mesh(this.geometry, this.material);
  private readonly scene = new Scene();
  private readonly camera = new OrthographicCamera(-1, 1, 1, -1, 0, 2);
  private readonly sample;
  private readonly step = uniform(new Vector2());
  private readonly opacity = uniform(1);
  private readonly mapping = new Matrix4();
  constructor(source: SpatialResource) {
    this.sample = texture(source.target.texture, uv().flipY());
    const coverage = (offset: Node<"vec2">) =>
      this.sample.sample(uv().flipY().add(offset)).a.smoothstep(0.04, 0.4);
    const zero = vec2(0),
      x = vec2(this.step.x, 0),
      y = vec2(0, this.step.y);
    const center = coverage(zero);
    const outer = coverage(x)
      .max(coverage(x.negate()))
      .max(coverage(y))
      .max(coverage(y.negate()))
      .max(coverage(this.step))
      .max(coverage(this.step.negate()))
      .max(coverage(vec2(this.step.x, this.step.y.negate())))
      .max(coverage(vec2(this.step.x.negate(), this.step.y)));
    this.material.fragmentNode = vec4(1, 1, 1, outer.sub(center).max(0).mul(this.opacity));
    this.mesh.matrixAutoUpdate = false;
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);
    this.camera.position.z = 1;
    this.camera.updateMatrixWorld();
  }
  render(
    renderer: WebGPURenderer,
    source: SpatialResource,
    compositionCamera: Camera,
    opacity: number,
  ) {
    this.sample.value = source.target.texture;
    // P(crop) = inverse(transport) * P(composition). Recover the exact
    // compositor mapping instead of estimating a projected source rectangle.
    this.mapping.multiplyMatrices(
      compositionCamera.projectionMatrix,
      source.camera.projectionMatrixInverse,
    );
    this.mesh.matrix.copy(this.mapping);
    this.mesh.matrixWorldNeedsUpdate = true;
    const size = renderer.getDrawingBufferSize(new Vector2());
    this.step.value.set(
      2.5 /
        Math.max(
          1,
          Math.hypot(this.mapping.elements[0]! * size.x, this.mapping.elements[1]! * size.y),
        ),
      2.5 /
        Math.max(
          1,
          Math.hypot(this.mapping.elements[4]! * size.x, this.mapping.elements[5]! * size.y),
        ),
    );
    this.opacity.value = opacity;
    renderer.render(this.scene, this.camera);
  }
  dispose() {
    this.geometry.dispose();
    this.material.dispose();
    this.scene.clear();
  }
}
