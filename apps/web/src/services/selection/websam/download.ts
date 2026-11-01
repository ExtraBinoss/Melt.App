import type { ModelDownloadEvent } from "../model/contract";
import { MODEL_CACHE, MODEL_FILES, MODEL_HASHES, modelUrl } from "../model/manifest";

async function verified(buffer: ArrayBuffer, file: string): Promise<void> {
  if (buffer.byteLength !== MODEL_FILES[file])
    throw new Error(`Incomplete segmentation model download: ${file}.`);
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", buffer));
  const hex = Array.from(hash, (value) => value.toString(16).padStart(2, "0")).join("");
  if (hex !== MODEL_HASHES[file]) throw new Error(`Segmentation model checksum failed: ${file}.`);
}

/** Sequential, bounded downloads with immutable URLs and verified real byte progress. */
export async function downloadModelFile(
  file: string,
  onProgress?: (event: ModelDownloadEvent) => void,
): Promise<Uint8Array<ArrayBuffer>> {
  const url = modelUrl(file),
    cache = globalThis.caches ? await caches.open(MODEL_CACHE) : undefined;
  const saved = await cache?.match(url);
  if (saved?.ok) {
    const buffer = await saved.arrayBuffer();
    try {
      await verified(buffer, file);
      onProgress?.({ file, status: "done" });
      return new Uint8Array(buffer);
    } catch {
      await cache?.delete(url);
    }
  }
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Segmentation model download failed (${response.status}).`);
  const size = MODEL_FILES[file]!,
    data = new Uint8Array(size),
    reader = response.body?.getReader();
  let loaded = 0;
  try {
    if (reader) {
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) break;
        if (loaded + chunk.value.byteLength > size)
          throw new Error(`Segmentation model exceeds its pinned size: ${file}.`);
        data.set(chunk.value, loaded);
        loaded += chunk.value.byteLength;
        onProgress?.({ file, status: "progress", loaded, total: size });
      }
    } else {
      const buffer = await response.arrayBuffer();
      if (buffer.byteLength !== size) throw new Error(`Incomplete segmentation model: ${file}.`);
      data.set(new Uint8Array(buffer));
      loaded = size;
    }
  } catch (error) {
    await reader?.cancel(error);
    throw error;
  } finally {
    reader?.releaseLock();
  }
  if (loaded !== size) throw new Error(`Incomplete segmentation model download: ${file}.`);
  await verified(data.buffer, file);
  // Cache writes are awaited: a full progress bar cannot simulate durable completion.
  await cache?.put(url, new Response(data, { headers: { "Content-Length": String(size) } }));
  onProgress?.({ file, status: "done" });
  return data;
}
