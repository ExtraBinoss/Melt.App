import type { Asset, ImageAsset } from "@musart/core";
import { ALPHA_CACHE_BYTES, MAX_ALPHA_PIXELS, type AlphaResponse } from "./alpha-model";
interface AlphaPlane {
  width: number;
  height: number;
  alpha: Uint8Array;
}
interface WorkerPort {
  onmessage: ((event: MessageEvent<AlphaResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage(message: { id: number; source: string; width: number; height: number }): void;
  terminate(): void;
}
const image = (asset: Asset): asset is ImageAsset => !asset.kind || asset.kind === "image";
/** One decoder, bounded source queue/cache. Pointer handlers only read retained bytes. */
export class SourceAlphaCache {
  private planes = new Map<string, AlphaPlane>();
  private failed = new Set<string>();
  private desired = new Map<string, ImageAsset>();
  private worker: WorkerPort | null = null;
  private pending: { id: number; source: string } | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private sequence = 0;
  private bytes = 0;
  private closed = false;
  constructor(
    private readonly changed: () => void,
    private readonly createWorker: () => WorkerPort = () =>
      new Worker(new URL("./alpha.worker.ts", import.meta.url), { type: "module" }),
  ) {}
  update(assets: readonly Asset[]) {
    if (this.closed) return;
    const desired = new Map<string, ImageAsset>();
    for (const asset of assets) {
      if (desired.size >= 64) break;
      if (image(asset) && asset.width * asset.height <= MAX_ALPHA_PIXELS)
        desired.set(asset.dataUrl, asset);
    }
    this.desired = desired;
    for (const [source, plane] of this.planes)
      if (!desired.has(source)) {
        this.bytes -= plane.alpha.byteLength;
        this.planes.delete(source);
      }
    for (const source of this.failed) if (!desired.has(source)) this.failed.delete(source);
    if (this.pending && !desired.has(this.pending.source)) this.stopWorker();
    this.next();
  }
  hit(source: string, u: number, v: number): boolean {
    const plane = this.planes.get(source);
    if (!plane) return true; // Unsupported/preparing sources retain explicit geometry fallback.
    const x = Math.min(plane.width - 1, Math.max(0, Math.floor(u * plane.width)));
    const y = Math.min(plane.height - 1, Math.max(0, Math.floor(v * plane.height)));
    return plane.alpha[y * plane.width + x]! > 0;
  }
  private next() {
    if (this.closed || this.pending) return;
    const asset = [...this.desired.values()].find(
      (item) => !this.planes.has(item.dataUrl) && !this.failed.has(item.dataUrl),
    );
    if (!asset) return;
    // Do not evict another desired source and then decode it again in a loop.
    if (this.bytes + asset.width * asset.height > ALPHA_CACHE_BYTES) {
      this.failed.add(asset.dataUrl);
      this.next();
      return;
    }
    try {
      if (!this.worker) {
        const worker = this.createWorker();
        this.worker = worker;
        worker.onmessage = ({ data }) => {
          if (this.worker === worker) this.accept(data);
        };
        worker.onerror = () => {
          if (this.worker === worker) this.fail();
        };
      }
      this.pending = { id: ++this.sequence, source: asset.dataUrl };
      this.timer = setTimeout(() => this.fail(), 15000);
      this.worker.postMessage({
        id: this.sequence,
        source: asset.dataUrl,
        width: asset.width,
        height: asset.height,
      });
    } catch {
      this.failed.add(asset.dataUrl);
      this.stopWorker();
      this.next();
    }
  }
  private accept(data: AlphaResponse) {
    const pending = this.pending;
    if (this.closed || !pending || pending.id !== data.id) return;
    clearTimeout(this.timer);
    this.pending = null;
    const size = data.width * data.height;
    if (
      this.desired.has(pending.source) &&
      data.alpha &&
      data.alpha.length === size &&
      Number.isSafeInteger(data.width) &&
      data.width > 0 &&
      Number.isSafeInteger(data.height) &&
      data.height > 0 &&
      size <= MAX_ALPHA_PIXELS &&
      this.bytes + size <= ALPHA_CACHE_BYTES
    ) {
      this.planes.set(pending.source, {
        width: data.width,
        height: data.height,
        alpha: data.alpha,
      });
      this.bytes += size;
      this.changed();
    } else this.failed.add(pending.source);
    this.next();
  }
  private fail() {
    if (this.pending) this.failed.add(this.pending.source);
    this.stopWorker();
    this.next();
  }
  private stopWorker() {
    clearTimeout(this.timer);
    if (this.worker) {
      this.worker.onmessage = this.worker.onerror = null;
      this.worker.terminate();
    }
    this.worker = null;
    this.pending = null;
  }
  dispose() {
    this.closed = true;
    this.stopWorker();
    this.planes.clear();
    this.desired.clear();
    this.failed.clear();
    this.bytes = 0;
  }
}
