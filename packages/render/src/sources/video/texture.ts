import { SRGBColorSpace, VideoFrameTexture } from "three";
import type { VideoFrameLease } from "./model";
import { VideoSourceError } from "./errors";

/** X is padding, never coverage. Some native RGB uploads still expose its arbitrary byte. */
export function hasOpaqueRgbPadding(frame: VideoFrame): boolean {
  return frame.format === "BGRX" || frame.format === "RGBX";
}

/** One consumer at a time. Its promise must cover actual upload/render/encode consumption. */
export class VideoFrameTextureOwner {
  private texture: VideoFrameTexture | null = null;
  private width = 0;
  private height = 0;
  private busy = false;
  private closed = false;
  private idle: (() => void) | null = null;
  private disposal: Promise<void> | null = null;
  private currentLease: VideoFrameLease | null = null;

  async withFrame<T>(
    lease: VideoFrameLease,
    consume: (texture: VideoFrameTexture) => T | Promise<T>,
  ): Promise<T> {
    if (this.closed || this.busy) {
      if (this.currentLease !== lease) lease.release();
      throw new VideoSourceError(this.closed ? "closed" : "busy", "Video texture is unavailable.");
    }
    this.busy = true;
    this.currentLease = lease;
    try {
      if (
        !this.texture ||
        this.width !== lease.frame.displayWidth ||
        this.height !== lease.frame.displayHeight
      ) {
        this.texture?.dispose();
        this.texture = new VideoFrameTexture();
        this.texture.colorSpace = SRGBColorSpace;
        this.width = lease.frame.displayWidth;
        this.height = lease.frame.displayHeight;
      }
      // Preserve packed RGB values: unpremultiplying by an undefined X byte corrupts brightness.
      this.texture.premultiplyAlpha = hasOpaqueRgbPadding(lease.frame);
      this.texture.setFrame(lease.frame);
      return await consume(this.texture);
    } finally {
      lease.release();
      this.busy = false;
      this.currentLease = null;
      this.idle?.();
      this.idle = null;
    }
  }

  dispose(): Promise<void> {
    if (this.disposal) return this.disposal;
    this.closed = true;
    this.disposal = (async () => {
      if (this.busy)
        await new Promise<void>((resolve) => {
          this.idle = resolve;
        });
      this.texture?.dispose();
      this.texture = null;
    })();
    return this.disposal;
  }
}
