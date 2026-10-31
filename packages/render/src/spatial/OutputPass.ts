import {
  Mesh,
  MeshBasicNodeMaterial,
  NoBlending,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  Texture,
  type Node,
  type RenderTarget,
  type WebGPURenderer,
} from "three/webgpu";
import {
  acesFilmicToneMapping,
  float,
  max,
  sRGBTransferOETF,
  texture,
  uniform,
  vec3,
  vec4,
} from "three/tsl";
import { textureUv } from "../compositing/nodes/uv";
import { compileGpuScene } from "../compositing/compile";
/** Encode lit linear RGB once before the existing working-RGB compositing graph. */
export class SpatialOutputPass {
  private readonly placeholder = new Texture();
  private readonly source = texture(this.placeholder);
  private readonly material = new MeshBasicNodeMaterial({
    depthTest: false,
    depthWrite: false,
    blending: NoBlending,
    toneMapped: false,
  });
  private readonly geometry = new PlaneGeometry(2, 2);
  private readonly scene = Object.assign(new Scene(), { name: "melt:spatial-output" });
  private readonly camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private compiled = false;
  constructor(private readonly renderer: WebGPURenderer) {
    const sample = this.source.sample(textureUv(uniform(1)));
    const linear = sample.rgb.div(max(sample.a, 0.000001));
    this.material.fragmentNode = vec4(
      vec3(sRGBTransferOETF(acesFilmicToneMapping(linear, float(1))) as Node<"vec3">).mul(sample.a),
      sample.a,
    );
    this.scene.add(new Mesh(this.geometry, this.material));
  }
  async prepare(target: RenderTarget, canContinue: () => boolean) {
    if (this.compiled) return;
    this.source.value = target.texture;
    await compileGpuScene(this.renderer, this.scene, this.camera, target, canContinue);
    this.compiled = true;
  }
  render(source: Texture, target: RenderTarget) {
    this.source.value = source;
    const previous = this.renderer.getRenderTarget(),
      auto = this.renderer.autoClear;
    try {
      this.renderer.autoClear = false;
      this.renderer.setRenderTarget(target);
      this.renderer.render(this.scene, this.camera);
    } finally {
      this.renderer.setRenderTarget(previous);
      this.renderer.autoClear = auto;
    }
  }
  dispose() {
    this.geometry.dispose();
    this.material.dispose();
    this.placeholder.dispose();
    this.scene.clear();
  }
}
