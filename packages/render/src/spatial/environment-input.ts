import {
  DataTexture,
  FloatType,
  HalfFloatType,
  LinearFilter,
  LinearSRGBColorSpace,
  RGBAFormat,
  SRGBColorSpace,
  TextureLoader,
  type Texture,
} from "three/webgpu";
import { assertEnvironmentDimensions, type EnvironmentPixels } from "./environment-decode";
export interface EnvironmentInput {
  width: number;
  height: number;
  texture: Texture;
}
let activeDecoders = 0;
async function decodeHdr(
  buffer: ArrayBuffer,
  mime: string,
  signal?: AbortSignal,
): Promise<EnvironmentPixels> {
  if (typeof Worker === "undefined")
    return (await import("./environment-decode")).decodeEnvironmentPixels(buffer, mime);
  if (activeDecoders >= 2) throw Error("Environment preparation queue is full");
  const worker = new Worker(new URL("./environment.worker.ts", import.meta.url), {
    type: "module",
  });
  activeDecoders++;
  let onAbort = () => {};
  try {
    return await new Promise((resolve, reject) => {
      onAbort = () =>
        reject(
          signal?.reason ?? new DOMException("Environment preparation cancelled", "AbortError"),
        );
      signal?.addEventListener("abort", onAbort, { once: true });
      if (signal?.aborted) return onAbort();
      worker.onerror = (event) => {
        event.preventDefault();
        reject(Error(event.message || "Environment worker failed"));
      };
      worker.onmessageerror = () => reject(Error("Invalid environment worker response"));
      worker.onmessage = (event: MessageEvent<{ value?: EnvironmentPixels; error?: string }>) => {
        if (event.data.value) resolve(event.data.value);
        else reject(Error(event.data.error ?? "Environment worker failed"));
      };
      worker.postMessage({ buffer, mime }, [buffer]);
    });
  } finally {
    signal?.removeEventListener("abort", onAbort);
    worker.terminate();
    activeDecoders--;
  }
}
/** Native source preparation only. HDR decode and filtering run off the main thread. */
export async function decodeEnvironment(
  dataUrl: string,
  mime: string,
  signal?: AbortSignal,
): Promise<EnvironmentInput> {
  signal?.throwIfAborted();
  if (mime === "image/vnd.radiance" || mime === "image/x-exr") {
    const response = await fetch(dataUrl, { signal });
    const pixels = await decodeHdr(await response.arrayBuffer(), mime, signal);
    signal?.throwIfAborted();
    const texture = new DataTexture(
      pixels.half ? new Uint16Array(pixels.data) : new Float32Array(pixels.data),
      pixels.width,
      pixels.height,
      RGBAFormat,
      pixels.half ? HalfFloatType : FloatType,
    );
    texture.colorSpace = LinearSRGBColorSpace;
    texture.minFilter = LinearFilter;
    texture.magFilter = LinearFilter;
    texture.needsUpdate = true;
    return { width: pixels.originalWidth, height: pixels.originalHeight, texture };
  }
  const texture: Texture = await new TextureLoader().loadAsync(dataUrl);
  try {
    signal?.throwIfAborted();
    const { width, height } = texture.image as { width: number; height: number };
    assertEnvironmentDimensions(width, height);
    if (width > 1024 || height > 512)
      texture.image = await createImageBitmap(texture.image as ImageBitmapSource, {
        resizeWidth: 1024,
        resizeHeight: 512,
        resizeQuality: "high",
      });
    signal?.throwIfAborted();
    texture.colorSpace = SRGBColorSpace;
    texture.needsUpdate = true;
    return { width, height, texture };
  } catch (error) {
    disposeEnvironmentInput(texture);
    throw error;
  }
}
export function disposeEnvironmentInput(texture: Texture) {
  texture.dispose();
  const image = texture.image as { close?: () => void } | null;
  image?.close?.();
}
