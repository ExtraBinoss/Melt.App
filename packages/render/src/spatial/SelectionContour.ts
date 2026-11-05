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
import { dFdx, dFdy, texture, uniform, uv, vec2, vec4 } from "three/tsl";
import type { SpatialResource } from "./SpatialResource";
import { contourPadding, SELECTION_CONTOUR_WIDTH } from "./selection-contour-frame";

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
  private readonly sourceScale = uniform(new Vector2(1, 1));
  private readonly sourceOffset = uniform(new Vector2());
  private readonly padding = uniform(new Vector2());
  private readonly radius = uniform(new Vector2());
  private readonly bufferSize = new Vector2();
  private readonly expansion = new Matrix4();
  private readonly opacity = uniform(1);
  private readonly mapping = new Matrix4();
  constructor(source: SpatialResource) {
    this.sample = texture(source.target.texture, uv().flipY());
    const p = uv().flipY().mul(this.padding.mul(2).add(1)).sub(this.padding);
    const coverage = (offset: Node<"vec2">) => {
      const q = p.add(offset);
      const inside = q.x
        .greaterThanEqual(0)
        .and(q.y.greaterThanEqual(0))
        .and(q.x.lessThanEqual(1))
        .and(q.y.lessThanEqual(1));
      return this.sample
        .sample(q.mul(this.sourceScale).add(this.sourceOffset))
        .a.smoothstep(0.04, 0.4)
        .mul(inside.select(1, 0));
    };
    const zero = vec2(0),
      x = dFdx(p).mul(this.radius.x),
      y = dFdy(p).mul(this.radius.y);
    const diagonal = x.add(y).mul(Math.SQRT1_2),
      otherDiagonal = x.sub(y).mul(Math.SQRT1_2);
    const center = coverage(zero);
    const outer = coverage(x)
      .max(coverage(x.negate()))
      .max(coverage(y))
      .max(coverage(y.negate()))
      .max(coverage(diagonal))
      .max(coverage(diagonal.negate()))
      .max(coverage(otherDiagonal))
      .max(coverage(otherDiagonal.negate()));
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
    displaySize?: { width: number; height: number },
  ) {
    this.sample.value = source.target.texture;
    // P(crop) = inverse(transport) * P(composition). Recover the exact
    // compositor mapping instead of estimating a projected source rectangle.
    this.mapping.multiplyMatrices(
      compositionCamera.projectionMatrix,
      source.camera.projectionMatrixInverse,
    );
    const size = renderer.getDrawingBufferSize(this.bufferSize);
    const width = displaySize?.width ?? size.x,
      height = displaySize?.height ?? size.y;
    if (!contourPadding(this.mapping, width, height, this.padding.value)) return;
    this.radius.value.set(
      (SELECTION_CONTOUR_WIDTH * size.x) / width,
      (SELECTION_CONTOUR_WIDTH * size.y) / height,
    );
    const target = source.target;
    this.sourceScale.value.set(target.viewport.z / target.width, target.viewport.w / target.height);
    this.sourceOffset.value.set(
      target.viewport.x / target.width,
      target.viewport.y / target.height,
    );
    this.expansion.makeScale(1 + 2 * this.padding.value.x, 1 + 2 * this.padding.value.y, 1);
    this.mesh.matrix.multiplyMatrices(this.mapping, this.expansion);
    this.mesh.matrixWorldNeedsUpdate = true;
    this.opacity.value = opacity;
    renderer.render(this.scene, this.camera);
  }
  dispose() {
    this.geometry.dispose();
    this.material.dispose();
    this.scene.clear();
  }
}
