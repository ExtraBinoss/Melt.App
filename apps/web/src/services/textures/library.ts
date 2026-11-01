import manifest from "./sources.json";
import {
  sameAssetOriginal,
  type EnginePort,
  type ImageAsset,
  type SessionSnapshot,
} from "@musart/core";
import { importImage } from "../assets/imports";
export const BUILTIN_TEXTURES = manifest;
export async function loadBuiltinTexture(id: string, signal: AbortSignal): Promise<ImageAsset> {
  const info = BUILTIN_TEXTURES.find((item) => item.id === id);
  if (!info) throw Error("Unknown bundled texture");
  const response = await fetch(`${import.meta.env.BASE_URL}textures/${info.id}.png`, { signal });
  if (!response.ok) throw Error("Texture download failed");
  const reader = response.body?.getReader();
  if (!reader) throw Error("Texture body unavailable");
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      signal.throwIfAborted();
      const next = await reader.read();
      if (next.done) break;
      length += next.value.length;
      if (length > info.bytes) throw Error("Texture exceeds its byte limit");
      chunks.push(next.value);
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  const data = bytes.buffer;
  signal.throwIfAborted();
  if (data.byteLength !== info.bytes) throw Error("Texture size mismatch");
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", data)), (v) =>
    v.toString(16).padStart(2, "0"),
  ).join("");
  if (digest !== info.sha256) throw Error("Texture integrity mismatch");
  const asset = await importImage(new File([data], `${info.id}.png`, { type: "image/png" }));
  signal.throwIfAborted();
  return { ...asset, id: `texture-${digest}` };
}
/** One document transaction: the original and its effect reference undo together. */
export function assignEffectImage(
  engine: EnginePort,
  before: SessionSnapshot,
  layerId: string,
  effectId: string,
  key: string,
  asset?: ImageAsset,
): void {
  const current = engine.getSnapshot();
  if (current.project !== before.project || current.pageId !== before.pageId) throw Error("stale");
  const layer = current.project.pages
    .find((page) => page.id === current.pageId)
    ?.layers.find((item) => item.id === layerId);
  if (!layer?.effects.some((effect) => effect.id === effectId)) throw Error("stale");
  let id = asset?.id;
  const existing = id ? current.project.assets[id] : undefined;
  if (asset && existing && !sameAssetOriginal(existing, asset)) {
    id = `texture-${crypto.randomUUID()}`;
    asset = { ...asset, id };
  }
  const effects = layer.effects.map((effect) => {
    if (effect.id !== effectId) return effect;
    const inputs = { ...effect.inputs };
    if (id) inputs[key] = id;
    else delete inputs[key];
    return { ...effect, inputs };
  });
  engine.transaction([
    { type: "updateLayers", ids: [layerId], patch: { effects } },
    ...(asset && !existing
      ? [{ type: "addAssets" as const, assets: [asset] }]
      : asset && id !== existing?.id
        ? [{ type: "addAssets" as const, assets: [asset] }]
        : []),
  ]);
}
