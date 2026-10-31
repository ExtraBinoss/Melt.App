import type { SpatialModelDefinition } from "@musart/assets";
import type { SceneAsset } from "@musart/core";
import { readDataUrl } from "./imports";
/** Bounded immutable originals only; GPU models belong to their render session. */
export class SpatialLibraryModels {
  private readonly ready = new Map<string, SceneAsset>();
  private bytes = 0;
  constructor(
    private readonly fetcher: (url: string, options: RequestInit) => Promise<Response> = fetch,
  ) {}
  async load(model: SpatialModelDefinition, signal: AbortSignal): Promise<SceneAsset> {
    signal.throwIfAborted();
    const cached = this.ready.get(model.id);
    if (cached) {
      this.ready.delete(model.id);
      this.ready.set(model.id, cached);
      return cached;
    }
    if (model.byteLength > 256 * 1024 || !/^spatial\/models\/[a-zA-Z0-9-]+\.glb$/.test(model.file))
      throw Error("Invalid bundled model description");
    const fetcher = this.fetcher;
    const response = await fetcher(`${import.meta.env.BASE_URL}${model.file}`, { signal });
    if (!response.ok || Number(response.headers.get("content-length")) > model.byteLength) {
      await response.body?.cancel();
      throw Error("Bundled model download failed");
    }
    const reader = response.body?.getReader();
    if (!reader) throw Error("Bundled model response is unavailable");
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
      while (true) {
        signal.throwIfAborted();
        const next = await reader.read();
        if (next.done) break;
        total += next.value.length;
        if (total > model.byteLength) throw Error("Bundled model exceeds its byte budget");
        chunks.push(next.value);
      }
    } catch (error) {
      await reader.cancel().catch(() => {});
      throw error;
    } finally {
      reader.releaseLock();
    }
    if (total !== model.byteLength) throw Error("Bundled model size mismatch");
    const data = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      data.set(chunk, offset);
      offset += chunk.length;
    }
    const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", data)), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
    if (digest !== model.sha256) throw Error("Bundled model integrity mismatch");
    signal.throwIfAborted();
    const asset: SceneAsset = Object.freeze({
      id: `library-${model.id}`,
      kind: "model3d",
      name: model.id,
      mime: "model/gltf-binary",
      width: 1,
      height: 1,
      byteLength: total,
      dataUrl: await readDataUrl(new Blob([data], { type: "model/gltf-binary" })),
      clips: [],
    });
    signal.throwIfAborted();
    const previous = this.ready.get(model.id);
    if (previous) this.bytes -= previous.dataUrl.length * 2;
    this.ready.delete(model.id);
    this.ready.set(model.id, asset);
    this.bytes += asset.dataUrl.length * 2;
    while (this.ready.size > 8 || this.bytes > 2 * 1024 * 1024) {
      const first = this.ready.entries().next().value;
      if (!first) break;
      this.ready.delete(first[0]);
      this.bytes -= first[1].dataUrl.length * 2;
    }
    return asset;
  }
  clear() {
    this.ready.clear();
    this.bytes = 0;
  }
}
