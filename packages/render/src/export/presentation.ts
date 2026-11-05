import {
  Vector2,
  Mesh,
  MeshBasicNodeMaterial,
  NoBlending,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  Texture,
  type WebGPURenderer,
} from "three/webgpu";
import { texture, uniform, uv } from "three/tsl";
import type { Bounds } from "@musart/core";
import type { FrameTexture } from "../compositing/types";
/** The final image remains a texture until browser-owned bitmap/PNG encoding. */
export class GpuPresentation {
  private readonly offset = uniform(new Vector2());
  private readonly extent = uniform(new Vector2(1, 1));
  private readonly source = texture(new Texture());
  private readonly material = new MeshBasicNodeMaterial({
    blending: NoBlending,
    transparent: false,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  private readonly geometry = new PlaneGeometry(2, 2);
  private readonly scene = new Scene();
  private readonly camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  constructor(private readonly renderer: WebGPURenderer) {
    this.material.fragmentNode = this.source.sample(uv().flipY().mul(this.extent).add(this.offset));
    this.scene.add(new Mesh(this.geometry, this.material));
  }
  render(
    frame: FrameTexture,
    output?: {
      width: number;
      height: number;
      region: Bounds;
      source: { width: number; height: number };
    },
  ): void {
    this.source.value = frame.texture;
    this.offset.value.set(
      output ? output.region.x / output.source.width : 0,
      output ? output.region.y / output.source.height : 0,
    );
    this.extent.value.set(
      output ? output.region.width / output.source.width : 1,
      output ? output.region.height / output.source.height : 1,
    );
    const width = output?.width ?? frame.width,
      height = output?.height ?? frame.height;
    const canvas = this.renderer.domElement;
    if (canvas.width !== width || canvas.height !== height)
      this.renderer.setSize(width, height, false);
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.scene, this.camera);
  }
  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
    this.scene.clear();
  }
}
