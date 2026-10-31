import { capToolImage } from "./prepare-image";
import { acceptToolFile } from "./input";
import { motionTimeToSeconds, type VideoAsset } from "@musart/core";
import { importImage } from "../../services/assets/imports";
import type { ToolDefinition } from "../catalog";
import type { ToolRenderApi, ToolSource } from "./types";
function readImage(file: Blob, signal: AbortSignal) {
  return new Promise<string>((resolve, reject) => {
    signal.throwIfAborted();
    const reader = new FileReader();
    const clean = () => signal.removeEventListener("abort", abort);
    const abort = () => {
      reader.abort();
      clean();
      reject(signal.reason);
    };
    reader.onload = () => {
      clean();
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("Invalid image data."));
    };
    reader.onerror = () => {
      clean();
      reject(reader.error ?? new Error("Image could not be read."));
    };
    signal.addEventListener("abort", abort, { once: true });
    reader.readAsDataURL(file);
  });
}
function dimensions(url: string, signal: AbortSignal) {
  return new Promise<{ width: number; height: number }>((resolve, reject) => {
    signal.throwIfAborted();
    const image = new Image();
    image.decoding = "async";
    const clean = () => {
      signal.removeEventListener("abort", abort);
      image.onload = image.onerror = null;
    };
    const abort = () => {
      clean();
      image.src = "";
      reject(signal.reason);
    };
    image.onload = () => {
      const result = { width: image.naturalWidth, height: image.naturalHeight };
      clean();
      resolve(result);
    };
    image.onerror = () => {
      clean();
      reject(new Error("Image could not be decoded."));
    };
    signal.addEventListener("abort", abort, { once: true });
    image.src = url;
  });
}
export async function prepareToolSource(
  file: File,
  tool: ToolDefinition,
  api: ToolRenderApi,
  signal: AbortSignal,
): Promise<ToolSource> {
  acceptToolFile(file, tool);
  if (tool.media === "image") {
    const asset = await importImage(file, {
      dataUrl: (blob) => readImage(blob, signal),
      dimensions: (url) => dimensions(url, signal),
    });
    signal.throwIfAborted();
    return {
      file,
      asset: await capToolImage(asset, file, signal, (blob) => readImage(blob, signal)),
      duration: 0,
      hasAudio: false,
    };
  }
  const probe = await api.probeVideoOriginal(file, { signal });
  signal.throwIfAborted();
  const asset: VideoAsset = {
    id: crypto.randomUUID(),
    kind: "video",
    name: file.name,
    mime: file.type,
    originalId: crypto.randomUUID(),
    contentRevision: crypto.randomUUID(),
    byteLength: file.size,
    width: probe.width,
    height: probe.height,
    duration: probe.duration,
    firstTimestamp: probe.firstTimestamp,
    timeResolution: probe.timeResolution,
    orientation: probe.orientation,
  };
  return {
    file,
    asset,
    duration: motionTimeToSeconds(asset.duration),
    hasAudio: !!probe.audio,
    resolver: {
      resolveOriginal: async (requested, options) => {
        signal.throwIfAborted();
        options?.signal?.throwIfAborted();
        if (
          requested.originalId !== asset.originalId ||
          requested.contentRevision !== asset.contentRevision
        )
          throw new Error("This media original is no longer active.");
        return file;
      },
    },
  };
}
