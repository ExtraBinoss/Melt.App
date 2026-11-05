import type { Bounds } from "@musart/core";
import {
  DoubleSide,
  Matrix3,
  Mesh,
  MeshBasicNodeMaterial,
  NoBlending,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  Texture,
  Vector4,
  type RenderTarget,
  type WebGPURenderer,
} from "three/webgpu";
import { abs, clamp, Fn, If, mix, step, texture, uniform, uv, vec2, vec3, vec4 } from "three/tsl";
import { textureFlip } from "./nodes/uv";
import type { FrameTexture } from "./types";

/** Resample a frame between authored/projected planes without changing its RGBA representation. */
export class ProjectionPass {
  private readonly placeholder = new Texture();
  private readonly source = texture(this.placeholder);
  private readonly sourceFlipY = uniform(0);
  private readonly sourceBounds = uniform(new Vector4(0, 0, 1, 1));
  private readonly targetBounds = uniform(new Vector4(0, 0, 1, 1));
  private readonly targetToSource = uniform(new Matrix3());
  private readonly material = new MeshBasicNodeMaterial({
    depthTest: false,
    depthWrite: false,
    blending: NoBlending,
    side: DoubleSide,
    toneMapped: false,
  });
  private readonly geometry = new PlaneGeometry(2, 2);
  private readonly scene = Object.assign(new Scene(), { name: "melt:effect-projection" });
  private readonly camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  constructor(private readonly renderer: WebGPURenderer) {
    this.material.name = "melt:effect-projection";
    this.material.fragmentNode = Fn(() => {
      const pixel = vec2(uv().x, uv().y.oneMinus())
        .mul(this.targetBounds.zw)
        .add(this.targetBounds.xy);
      const mapped = this.targetToSource.mul(vec3(pixel, 1)).toVar();
      const color = vec4(0).toVar();
      // Reject the horizon and overflow before division or sampling. Comparisons
      // also reject NaN, avoiding an invalid sample multiplied by a zero mask.
      const finite = abs(mapped.x)
        .lessThan(1e30)
        .and(abs(mapped.y).lessThan(1e30))
        .and(abs(mapped.z).lessThan(1e30))
        .and(abs(mapped.z).greaterThan(0.000001));
      If(finite, () => {
        const coord = mapped.xy.div(mapped.z).sub(this.sourceBounds.xy).div(this.sourceBounds.zw);
        const inside = step(0, coord.x)
          .mul(step(coord.x, 1))
          .mul(step(0, coord.y))
          .mul(step(coord.y, 1));
        const bounded = clamp(coord, 0, 1);
        const sample = this.source.sample(
          vec2(bounded.x, mix(bounded.y.oneMinus(), bounded.y, this.sourceFlipY)),
        );
        color.assign(sample.mul(inside));
      });
      return color;
    })();
    this.scene.add(new Mesh(this.geometry, this.material));
  }
  render(
    source: FrameTexture,
    sourceBounds: Bounds,
    target: RenderTarget,
    targetBounds: Bounds,
    targetToSource: readonly number[],
  ): void {
    if (source.texture === target.texture)
      throw Error("Projection cannot sample its output target.");
    if (targetToSource.length !== 9 || !targetToSource.every(Number.isFinite))
      throw new RangeError("Invalid projection matrix.");
    for (const bounds of [sourceBounds, targetBounds])
      if (!Object.values(bounds).every(Number.isFinite) || bounds.width <= 0 || bounds.height <= 0)
        throw new RangeError("Invalid projection bounds.");
    this.source.value = source.texture;
    this.sourceFlipY.value = textureFlip(source.texture);
    this.sourceBounds.value.set(
      sourceBounds.x,
      sourceBounds.y,
      sourceBounds.width,
      sourceBounds.height,
    );
    this.targetBounds.value.set(
      targetBounds.x,
      targetBounds.y,
      targetBounds.width,
      targetBounds.height,
    );
    this.targetToSource.value.fromArray(targetToSource);
    const previous = this.renderer.getRenderTarget(),
      face = this.renderer.getActiveCubeFace(),
      mip = this.renderer.getActiveMipmapLevel(),
      auto = this.renderer.autoClear;
    try {
      this.renderer.autoClear = false;
      this.renderer.setRenderTarget(target);
      this.renderer.render(this.scene, this.camera);
    } finally {
      this.renderer.setRenderTarget(previous, face, mip);
      this.renderer.autoClear = auto;
    }
  }
  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
    this.placeholder.dispose();
    this.scene.clear();
  }
}
