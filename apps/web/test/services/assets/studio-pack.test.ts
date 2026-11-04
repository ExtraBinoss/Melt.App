import { beforeEach, afterEach, expect, test, vi } from "vitest";
import { webcrypto } from "node:crypto";
import { readFileSync } from "node:fs";
import { StudioPackCache } from "../../../src/services/assets/studio/cache";
import {
  STUDIO_PACK,
  parseManifest,
  readBounded,
  verifyBytes,
} from "../../../src/services/assets/studio/integrity";
import { unpackStudioZip } from "../../../src/services/assets/studio/unpack";
const manifestBytes = new Uint8Array(readFileSync(`apps/web/public/${STUDIO_PACK.manifestFile}`));
const zipBytes = new Uint8Array(readFileSync(`apps/web/public/${STUDIO_PACK.file}`));
const manifest = parseManifest(manifestBytes);
const requestKey = (request: RequestInfo | URL) =>
  typeof request === "string" ? request : request instanceof URL ? request.href : request.url;
class MemoryCache {
  readonly entries = new Map<string, Response>();
  async match(request: RequestInfo | URL) {
    return this.entries.get(requestKey(request))?.clone();
  }
  async put(request: RequestInfo | URL, response: Response) {
    this.entries.set(requestKey(request), response.clone());
  }
}
function memoryStorage() {
  const caches = new Map<string, MemoryCache>();
  return {
    caches,
    has: vi.fn(async (name: string) => caches.has(name)),
    open: vi.fn(async (name: string) => {
      let cache = caches.get(name);
      if (!cache) {
        cache = new MemoryCache();
        caches.set(name, cache);
      }
      return cache;
    }),
    delete: vi.fn(async (name: string) => caches.delete(name)),
  };
}
function downloads() {
  return vi.fn(
    async (request: RequestInfo | URL) =>
      new Response(
        new Uint8Array(requestKey(request).endsWith(".zip") ? zipBytes : manifestBytes).buffer,
      ),
  );
}
const unpack = async (bytes: Uint8Array) => unpackStudioZip(bytes, manifest);
beforeEach(() => vi.stubGlobal("crypto", webcrypto));
afterEach(() => vi.unstubAllGlobals());
test("the frozen expansion has 474 bounded self-contained CC0 originals with exact provenance and hashes", async () => {
  await verifyBytes(zipBytes, STUDIO_PACK);
  await verifyBytes(manifestBytes, {
    byteLength: STUDIO_PACK.manifestBytes,
    sha256: STUDIO_PACK.manifestSha256,
  });
  const files = unpackStudioZip(zipBytes, manifest);
  expect(manifest.models).toHaveLength(474);
  for (const model of manifest.models) {
    expect(model.license).toBe("CC0-1.0");
    expect(model.archiveSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(model.originalSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(model.byteLength).toBeLessThanOrEqual(256 * 1024);
    const bytes = files[model.file]!;
    await verifyBytes(bytes, model);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const gltf = JSON.parse(
      new TextDecoder().decode(bytes.subarray(20, 20 + view.getUint32(12, true))),
    );
    expect(gltf.images?.some((image: { uri?: string }) => image.uri) ?? false).toBe(false);
    expect(gltf.buffers.some((buffer: { uri?: string }) => buffer.uri)).toBe(false);
  }
});
test("checking is lazy; completed installs serve actual cached bytes offline and detect evicted models", async () => {
  const storage = memoryStorage(),
    fetcher = downloads();
  const library = new StudioPackCache(storage as unknown as CacheStorage, fetcher, unpack);
  const signal = new AbortController().signal;
  expect(await library.installed(signal)).toBeNull();
  expect(fetcher).not.toHaveBeenCalled();
  const installed = await library.install(signal, () => {});
  expect(installed.models).toHaveLength(474);
  expect(fetcher).toHaveBeenCalledTimes(2);
  fetcher.mockRejectedValue(Error("Offline"));
  const model = installed.models[0]!;
  const response = await library.fetchModel(`/${model.file}`, { signal });
  await verifyBytes(new Uint8Array(await response.arrayBuffer()), model);
  expect(await library.installed(signal)).not.toBeNull();
  const installedCache = [...storage.caches.entries()].find(
    ([name]) => name.startsWith("melt-studio-pack-") && !name.includes("index"),
  )![1];
  for (const key of installedCache.entries.keys())
    if (key.endsWith(model.file)) installedCache.entries.delete(key);
  expect(await library.installed(signal)).toBeNull();
  await expect(library.fetchModel(`/${model.file}`, { signal })).rejects.toThrow("missing");
  expect(fetcher).toHaveBeenCalledTimes(2);
});
test("cancellation and per-file integrity failure discard staging and never publish an installation", async () => {
  const storage = memoryStorage(),
    fetcher = downloads();
  const controller = new AbortController();
  const library = new StudioPackCache(storage as unknown as CacheStorage, fetcher, unpack);
  await expect(
    library.install(controller.signal, (value) => {
      if (value > 0.7) controller.abort();
    }),
  ).rejects.toThrow();
  expect(storage.caches.size).toBe(0);
  expect(await library.installed(new AbortController().signal)).toBeNull();
  const corrupt = new StudioPackCache(
    storage as unknown as CacheStorage,
    fetcher,
    async (bytes) => {
      const files = await unpack(bytes);
      files[manifest.models[0]!.file]![0] ^= 1;
      return files;
    },
  );
  await expect(corrupt.install(new AbortController().signal, () => {})).rejects.toThrow(
    "integrity",
  );
  expect(storage.caches.size).toBe(0);
});
test("bounded download rejects oversized, corrupt and cancelled streams before extraction", async () => {
  const signal = new AbortController().signal,
    expected = manifest.models[0]!;
  await expect(
    readBounded(new Response(new Uint8Array(expected.byteLength + 1)), expected, signal),
  ).rejects.toThrow("budget");
  await expect(
    readBounded(new Response(new Uint8Array(expected.byteLength)), expected, signal),
  ).rejects.toThrow("integrity");
  const controller = new AbortController();
  controller.abort();
  await expect(
    readBounded(new Response(zipBytes), STUDIO_PACK, controller.signal),
  ).rejects.toThrow();
  const wrong = new Uint8Array(zipBytes);
  wrong[100] ^= 1;
  const unpacker = vi.fn(unpack);
  const library = new StudioPackCache(
    memoryStorage() as unknown as CacheStorage,
    vi.fn(
      async (request) => new Response(String(request).endsWith(".zip") ? wrong : manifestBytes),
    ),
    unpacker,
  );
  await expect(library.install(signal, () => {})).rejects.toThrow("integrity");
  expect(unpacker).not.toHaveBeenCalled();
});
