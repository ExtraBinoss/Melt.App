import type { ImageAsset } from "@musart/core";
import type { WeightedColor } from "./colors";
import { MAX_PALETTE_SOURCE_LENGTH, MAX_PALETTE_SOURCE_PIXELS } from "./image-model";
import type { PaletteImageResponse } from "./image-model";

interface Request {
  id: number;
  asset: ImageAsset;
  signal: AbortSignal;
  resolve: (colors: WeightedColor[]) => void;
  reject: (error: Error) => void;
  detach: () => void;
}
const abortError = () => new DOMException("Palette detection was cancelled.", "AbortError");

/** One worker/active decode, at most sixteen waiting originals and 24 small histograms. */
export class PaletteImageSampler {
  private worker?: Worker;
  private active?: Request;
  private timer?: ReturnType<typeof setTimeout>;
  private queue: Request[] = [];
  private cache = new WeakMap<ImageAsset, WeightedColor[]>();
  private cachedAssets: WeakRef<ImageAsset>[] = [];
  private sequence = 0;
  private disposed = false;

  constructor(
    private readonly createWorker: () => Worker | undefined = () =>
      typeof Worker === "undefined"
        ? undefined
        : new Worker(new URL("./image.worker.ts", import.meta.url), { type: "module" }),
  ) {}

  sample(asset: ImageAsset, signal: AbortSignal): Promise<WeightedColor[]> {
    if (this.disposed || signal.aborted) return Promise.reject(abortError());
    const cached = this.cache.get(asset);
    if (cached) return Promise.resolve(cached);
    if (
      asset.width * asset.height > MAX_PALETTE_SOURCE_PIXELS ||
      asset.dataUrl.length > MAX_PALETTE_SOURCE_LENGTH
    )
      return Promise.resolve([]);
    if (this.queue.length >= 16) return Promise.reject(Error("Palette sampling queue is full."));
    return new Promise((resolve, reject) => {
      const request: Request = {
        id: ++this.sequence,
        asset,
        signal,
        resolve,
        reject,
        detach: () => signal.removeEventListener("abort", cancel),
      };
      const cancel = () => {
        if (this.active === request) {
          this.resetWorker();
          this.finish(undefined, abortError());
        } else {
          this.queue = this.queue.filter((entry) => entry !== request);
          request.detach();
          reject(abortError());
        }
      };
      signal.addEventListener("abort", cancel, { once: true });
      this.queue.push(request);
      this.next();
    });
  }

  dispose() {
    this.disposed = true;
    this.resetWorker();
    const remaining = [...(this.active ? [this.active] : []), ...this.queue];
    this.active = undefined;
    this.queue = [];
    for (const request of remaining) {
      request.detach();
      request.reject(abortError());
    }
    this.cache = new WeakMap();
    this.cachedAssets = [];
  }

  private resetWorker() {
    clearTimeout(this.timer);
    if (this.worker) {
      this.worker.onmessage = this.worker.onerror = null;
      this.worker.terminate();
      this.worker = undefined;
    }
  }

  private finish(colors?: WeightedColor[], error?: Error) {
    const request = this.active;
    if (!request) return;
    clearTimeout(this.timer);
    this.active = undefined;
    request.detach();
    if (error) request.reject(error);
    else {
      const result = colors ?? [];
      if (!this.cache.has(request.asset)) this.cachedAssets.push(new WeakRef(request.asset));
      this.cache.set(request.asset, result);
      if (this.cachedAssets.length > 24) {
        const retired = this.cachedAssets.shift()?.deref();
        if (retired) this.cache.delete(retired);
      }
      request.resolve(result);
    }
    this.next();
  }

  private next() {
    if (this.disposed || this.active || !this.queue.length) return;
    const request = this.queue.shift()!;
    this.active = request;
    try {
      this.worker ??= this.createWorker();
      if (!this.worker) {
        this.finish([]);
        return;
      }
      this.worker.onmessage = ({ data }: MessageEvent<PaletteImageResponse>) => {
        if (data.id !== this.active?.id) return;
        if (data.error) this.finish(undefined, Error(data.error));
        else if (data.colors || data.unsupported) this.finish(data.colors ?? []);
        else this.finish(undefined, Error("Invalid palette sampling response."));
      };
      this.worker.onerror = (event) => {
        this.resetWorker();
        this.finish(undefined, Error(event.message || "Palette sampling failed."));
      };
      this.timer = setTimeout(() => {
        this.resetWorker();
        this.finish(undefined, Error("Palette sampling timed out."));
      }, 10_000);
      const { dataUrl: source, width, height } = request.asset;
      this.worker.postMessage({ id: request.id, source, width, height });
    } catch (error) {
      this.resetWorker();
      this.finish(undefined, error instanceof Error ? error : Error(String(error)));
    }
  }
}
