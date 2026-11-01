import {
  LinearFilter,
  LinearMipmapLinearFilter,
  NearestFilter,
  NoColorSpace,
  RenderTarget,
  UnsignedByteType,
  type Texture,
} from "three/webgpu";
import type { GpuResource } from "../cache/GpuResourceCache";
import type { FrameTexture } from "./types";
import { assertTextureSize } from "../cache/texture-limits";

function bytes(width: number, height: number, mipmapped = false, samples = 0): number {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1)
    throw new RangeError("Invalid GPU target dimensions.");
  let pixels = width * height * (samples > 1 ? samples + 1 : 1);
  while (mipmapped && (width > 1 || height > 1)) {
    width = Math.max(1, Math.floor(width / 2));
    height = Math.max(1, Math.floor(height / 2));
    pixels += width * height;
  }
  return pixels * 4;
}

export class LayerTargets implements GpuResource {
  constructor(private readonly maxDimension: number) {}
  signature = "";
  output: FrameTexture | null = null;
  /** Source-local treatment survives changes to the world-space mask mapping. */
  effectSource: { signature: string; output: FrameTexture } | null = null;
  private readonly buffers = new Map<string, RenderTarget>();
  private source: Texture | null = null;
  sourceSignature = "";
  sourceBytes = 0;
  projectedBytes(
    role: string,
    width: number,
    height: number,
    mipmapped = false,
    samples = 0,
  ): number {
    assertTextureSize(width, height, this.maxDimension);
    const target = this.buffers.get(role);
    return (
      this.bytes -
      (target
        ? bytes(target.width, target.height, target.texture.generateMipmaps, target.samples)
        : 0) +
      bytes(width, height, mipmapped, samples)
    );
  }
  target(
    role: string,
    width: number,
    height: number,
    mipmapped = false,
    samples = 0,
  ): RenderTarget {
    assertTextureSize(width, height, this.maxDimension);
    let target = this.buffers.get(role);
    if (target && target.texture.generateMipmaps !== mipmapped)
      throw new Error("A GPU target role cannot change its filtering policy.");
    if (target && target.samples !== samples)
      throw new Error("A GPU target role cannot change its sampling policy.");
    if (!target) {
      target = new RenderTarget(width, height, {
        samples,
        depthBuffer: false,
        stencilBuffer: false,
        type: UnsignedByteType,
        minFilter: mipmapped ? LinearMipmapLinearFilter : LinearFilter,
        magFilter: mipmapped ? NearestFilter : LinearFilter,
        generateMipmaps: mipmapped,
      });
      target.texture.colorSpace = NoColorSpace;
      this.buffers.set(role, target);
    } else target.setSize(width, height);
    return target;
  }
  /** Never overwrite the texture currently borrowed by the display while preparing its successor. */
  nextPresentationRole(): string {
    return this.output?.texture === this.buffers.get("presentation-a")?.texture
      ? "presentation-b"
      : "presentation-a";
  }
  get sourceTexture(): Texture | null {
    return this.source;
  }
  setSource(texture: Texture, signature: string, bytes: number): void {
    this.source?.dispose();
    this.source = texture;
    this.sourceSignature = signature;
    this.sourceBytes = bytes;
  }
  get bytes(): number {
    return (
      this.sourceBytes +
      [...this.buffers.values()].reduce(
        (sum, target) =>
          sum + bytes(target.width, target.height, target.texture.generateMipmaps, target.samples),
        0,
      )
    );
  }
  get targets(): number {
    return this.buffers.size;
  }
  dispose(): void {
    this.source?.dispose();
    this.source = null;
    for (const target of this.buffers.values()) target.dispose();
    this.buffers.clear();
    this.output = null;
    this.effectSource = null;
    this.sourceBytes = 0;
  }
}
