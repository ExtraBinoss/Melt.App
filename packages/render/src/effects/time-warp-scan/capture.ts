import {
  Mesh,
  MeshBasicNodeMaterial,
  NoBlending,
  OrthographicCamera,
  PlaneGeometry,
  RenderTarget,
  Scene,
  DataTexture,
  RGBAFormat,
  Vector4,
  type WebGPURenderer,
} from "three/webgpu";
import { max, mix, texture, uniform, uv, vec2, vec4 } from "three/tsl";
import type { Bounds, Effect } from "@musart/core";
import type { FrameTexture } from "../../compositing/types";
import { compileGpuScene } from "../../compositing/compile";
import { createEffectUniforms, updateEffectUniforms } from "../shared/uniforms";
import { warpCoordinate, scanSample, scanCoordinate } from "./field";

/** A scissored GPU copy: captured strips never sample the target they write. */
export class ScanCapturePass {
  private readonly neutral = new DataTexture(new Uint8Array(4), 1, 1, RGBAFormat);
  private readonly source = texture(this.neutral);
  private readonly normalize = uniform(0);
  private readonly region = uniform(new Vector4(0, 0, 1, 1));
  private readonly scene = new Scene();
  private readonly camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly geometry = new PlaneGeometry(2, 2);
  private readonly material = new MeshBasicNodeMaterial({
    depthTest: false,
    depthWrite: false,
    blending: NoBlending,
    toneMapped: false,
  });
  private readonly controls: ReturnType<typeof createEffectUniforms>;
  private compiled = false;
  passes = 0;
  constructor(
    private readonly renderer: WebGPURenderer,
    effect: Effect,
  ) {
    this.neutral.needsUpdate = true;
    this.controls = createEffectUniforms(effect, 1, 1);
    const warped = warpCoordinate(
      uv(),
      scanCoordinate(uv(), this.controls).clamp(0, 1),
      this.controls,
    );
    const coord = vec2(
      warped.x.mul(this.region.z).add(this.region.x),
      warped.y.mul(this.region.w).add(this.region.y),
    );
    const value = scanSample(this.source, coord, this.controls);
    this.material.fragmentNode = vec4(
      mix(value.rgb, value.rgb.div(max(value.a, 0.000001)), this.normalize),
      value.a,
    );
    this.material.name = "melt:time-warp-scan:capture";
    this.scene.add(new Mesh(this.geometry, this.material));
  }
  async draw(
    source: FrameTexture,
    sourceBounds: Bounds,
    bounds: Bounds,
    content: Bounds,
    effect: Effect,
    strip: Bounds,
    output: RenderTarget,
    canContinue: () => boolean,
  ) {
    if (!strip.width || !strip.height) return;
    updateEffectUniforms(this.controls, effect, output.width, output.height, {
      width: bounds.width,
      height: bounds.height,
      content,
    });
    this.source.value = source.texture;
    this.controls.sourceFlipY.value = source.texture.isRenderTargetTexture ? 1 : 0;
    this.normalize.value = source.premultiplied ? 1 : 0;
    this.region.value.set(
      (bounds.x - sourceBounds.x) / sourceBounds.width,
      1 - (bounds.y - sourceBounds.y + bounds.height) / sourceBounds.height,
      bounds.width / sourceBounds.width,
      bounds.height / sourceBounds.height,
    );
    if (!this.compiled) {
      await compileGpuScene(this.renderer, this.scene, this.camera, output, canContinue);
      this.compiled = true;
    }
    if (!canContinue()) throw new DOMException("Rendering deferred.", "AbortError");
    const previous = this.renderer.getRenderTarget(),
      auto = this.renderer.autoClear;
    const scissor = output.scissor.clone(),
      test = output.scissorTest,
      rendererTest = this.renderer.getScissorTest();
    try {
      output.scissor.set(strip.x, strip.y, strip.width, strip.height);
      output.scissorTest = true;
      this.renderer.setScissorTest(true);
      this.renderer.autoClear = false;
      this.renderer.setRenderTarget(output);
      this.renderer.render(this.scene, this.camera);
      this.passes++;
    } finally {
      output.scissor.copy(scissor);
      output.scissorTest = test;
      this.renderer.setScissorTest(rendererTest);
      this.renderer.setRenderTarget(previous);
      this.renderer.autoClear = auto;
    }
  }
  releaseInput() {
    this.source.value = this.neutral;
  }
  dispose() {
    this.releaseInput();
    this.material.dispose();
    this.geometry.dispose();
    this.neutral.dispose();
  }
}
