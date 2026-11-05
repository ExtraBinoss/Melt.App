import metadata from "./posters.json";
import { readBounded, STUDIO_PACK } from "./integrity";

export const PACK_POSTERS = metadata;
const CACHE = "melt-studio-pack-posters-v1";
/** One immutable, integrity-checked sprite sheet also serves installed packs offline. */
export async function loadPackPosters(
  signal: AbortSignal,
  storage: CacheStorage | undefined = globalThis.caches,
  fetcher: typeof fetch = fetch,
): Promise<Blob> {
  if (
    metadata.manifestSha256 !== STUDIO_PACK.manifestSha256 ||
    metadata.count !== STUDIO_PACK.count
  )
    throw new Error("Pack thumbnail manifest mismatch");
  const request = new URL(`${import.meta.env.BASE_URL}${metadata.file}`, location.origin).href;
  const cache = storage ? await storage.open(CACHE) : undefined;
  signal.throwIfAborted();
  const cached = await cache?.match(request);
  if (cached) {
    try {
      return new Blob([new Uint8Array(await readBounded(cached, metadata, signal)).buffer], {
        type: "image/webp",
      });
    } catch {
      signal.throwIfAborted();
      await cache?.delete(request);
    }
  }
  const bytes = await readBounded(await fetcher(request, { signal }), metadata, signal);
  signal.throwIfAborted();
  if (cache) {
    await cache.put(
      request,
      new Response(new Uint8Array(bytes).buffer, {
        headers: { "content-type": "image/webp", "content-length": String(bytes.length) },
      }),
    );
    signal.throwIfAborted();
    for (const prior of await cache.keys()) if (prior.url !== request) await cache.delete(prior);
  }
  return new Blob([new Uint8Array(bytes).buffer], { type: "image/webp" });
}

export function packPosterStyle(index: number, image: string) {
  return {
    backgroundImage: image ? `url("${image}")` : undefined,
    backgroundSize: `${metadata.columns * 100}% ${metadata.rows * 100}%`,
    backgroundPosition: `${((index % metadata.columns) * 100) / (metadata.columns - 1)}% ${(Math.floor(index / metadata.columns) * 100) / (metadata.rows - 1)}%`,
  };
}
