import { STUDIO_PACK, parseManifest, readBounded, verifyBytes } from "./integrity";
import type { StudioManifest } from "./integrity";
import { unpackInWorker } from "./worker";
const INDEX = "melt-studio-pack-index-v1";
const PREFIX = `melt-studio-pack-${STUDIO_PACK.sha256}-`;
const baseUrl = () =>
  new URL(import.meta.env.BASE_URL, globalThis.location?.origin ?? "https://melt.invalid");
const url = (file: string) => new URL(file, baseUrl()).href;
const markerUrl = () => url(`__offline-studio/${STUDIO_PACK.id}`);
const manifestDescription = {
  byteLength: STUDIO_PACK.manifestBytes,
  sha256: STUDIO_PACK.manifestSha256,
};
type Unpack = typeof unpackInWorker;
export class StudioPackCache {
  constructor(
    private readonly storage: CacheStorage | undefined = globalThis.caches,
    private readonly fetcher: (
      input: RequestInfo | URL,
      init?: RequestInit,
    ) => Promise<Response> = fetch,
    private readonly unpack: Unpack = unpackInWorker,
  ) {}
  get supported() {
    return !!this.storage;
  }
  private async pointer() {
    if (!this.storage || !(await this.storage.has(INDEX))) return null;
    const response = await (await this.storage.open(INDEX)).match(markerUrl());
    if (!response) return null;
    const name: unknown = await response.json();
    return typeof name === "string" && name.startsWith(PREFIX) && (await this.storage.has(name))
      ? name
      : null;
  }
  async installed(signal: AbortSignal): Promise<StudioManifest | null> {
    signal.throwIfAborted();
    const name = await this.pointer();
    if (!name || !this.storage) return null;
    const cache = await this.storage.open(name),
      response = await cache.match(url(STUDIO_PACK.manifestFile));
    if (!response) return null;
    try {
      const manifest = parseManifest(await readBounded(response, manifestDescription, signal));
      for (const file of [...manifest.models, ...manifest.licenses]) {
        signal.throwIfAborted();
        const entry = await cache.match(url(file.file));
        if (!entry || Number(entry.headers.get("content-length")) !== file.byteLength) return null;
      }
      return manifest;
    } catch (error) {
      signal.throwIfAborted();
      if (error instanceof Error) return null;
      throw error;
    }
  }
  /** Cache-only fetcher; a missing offline entry must never silently hit the network. */
  readonly fetchModel = async (request: string, options: RequestInit): Promise<Response> => {
    options.signal?.throwIfAborted();
    const requestUrl = new URL(request, baseUrl());
    if (
      !requestUrl.pathname.startsWith(new URL("spatial/models/studio-", baseUrl()).pathname) ||
      !requestUrl.pathname.endsWith(".glb") ||
      requestUrl.origin !== baseUrl().origin
    )
      throw Error("Invalid offline model path");
    const name = await this.pointer();
    const response =
      name && this.storage
        ? await (await this.storage.open(name)).match(requestUrl.href)
        : undefined;
    options.signal?.throwIfAborted();
    if (!response) throw Error("Offline model is missing; download the library again");
    return response;
  };
  async install(
    signal: AbortSignal,
    progress: (fraction: number) => void,
  ): Promise<StudioManifest> {
    if (!this.storage) throw Error("Offline library storage is unavailable");
    if (globalThis.navigator?.locks)
      return navigator.locks.request(`melt-studio-install-${STUDIO_PACK.id}`, { signal }, () =>
        this.performInstall(signal, progress),
      );
    return this.performInstall(signal, progress);
  }
  private async performInstall(signal: AbortSignal, progress: (fraction: number) => void) {
    const storage = this.storage!;
    // Native browser fetch must not receive this cache instance as its receiver.
    const fetcher = this.fetcher;
    const existing = await this.installed(signal);
    if (existing) {
      progress(1);
      return existing;
    }
    const manifestBytes = await readBounded(
      await fetcher(url(STUDIO_PACK.manifestFile), { signal }),
      manifestDescription,
      signal,
    );
    const manifest = parseManifest(manifestBytes);
    const zip = await readBounded(
      await fetcher(url(STUDIO_PACK.file), { signal }),
      STUDIO_PACK,
      signal,
      (bytes) => progress((0.7 * bytes) / STUDIO_PACK.byteLength),
    );
    const files = await this.unpack(zip, manifest, signal);
    signal.throwIfAborted();
    const name = `${PREFIX}${crypto.randomUUID()}`;
    let complete = false;
    try {
      const cache = await storage.open(name);
      const entries = [...manifest.models, ...manifest.licenses];
      for (let index = 0; index < entries.length; index++) {
        const item = entries[index]!,
          bytes = files[item.file];
        signal.throwIfAborted();
        if (!bytes) throw Error("Missing pack original");
        await verifyBytes(bytes, item);
        signal.throwIfAborted();
        await cache.put(
          url(item.file),
          new Response(new Uint8Array(bytes).buffer, {
            headers: {
              "content-type": item.file.endsWith(".glb") ? "model/gltf-binary" : "text/plain",
              "content-length": String(bytes.length),
            },
          }),
        );
        delete files[item.file];
        progress(0.7 + (0.29 * (index + 1)) / entries.length);
      }
      await cache.put(
        url(STUDIO_PACK.manifestFile),
        new Response(new Uint8Array(manifestBytes).buffer, {
          headers: {
            "content-type": "application/x-ndjson",
            "content-length": String(manifestBytes.length),
          },
        }),
      );
      signal.throwIfAborted();
      const previous = await this.pointer();
      signal.throwIfAborted();
      await (await storage.open(INDEX)).put(markerUrl(), new Response(JSON.stringify(name)));
      complete = true;
      if (previous && previous !== name) await storage.delete(previous).catch(() => false);
      progress(1);
      return manifest;
    } finally {
      if (!complete) await storage.delete(name);
    }
  }
}
