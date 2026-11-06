import { createDepthScheduling } from "./scheduling";
import type { VideoAsset } from "@musart/core";
import { LocalModelManager } from "../selection/model/manager";
import type { ModelDownloadEvent } from "../selection/model/contract";
import { DEPTH_MODEL } from "./manifest";
export interface DepthResult {
  blob: Blob;
  width: number;
  height: number;
}
export type DepthResponse = {
  progress?: ModelDownloadEvent;
  fraction?: number;
  result?: DepthResult;
  error?: string;
  ready?: boolean;
  yield?: boolean;
};
/** One worker and one request at a time. Termination cancels fetch, decode, inference and encode. */
export class DepthClient {
  private worker: Worker | undefined;
  private scheduling: ReturnType<typeof createDepthScheduling> | undefined;
  private pending:
    | {
        resolve: (value: DepthResult | undefined) => void;
        reject: (reason: unknown) => void;
        fraction?: (value: number) => void;
      }
    | undefined;
  readonly model = new LocalModelManager(
    {
      prepare: async () => {
        if (this.pending) throw Error("Depth preparation is busy.");
        this.scheduling?.dispose();
        this.scheduling = createDepthScheduling();
        await this.request({ type: "prepare" });
      },
      cancel: () => this.cancel(),
    },
    DEPTH_MODEL,
  );
  private request(
    message: object,
    fraction?: (value: number) => void,
  ): Promise<DepthResult | undefined> {
    if (this.pending) return Promise.reject(Error("Depth preparation is busy."));
    this.worker ??= new Worker(new URL("./depth.worker.ts", import.meta.url), { type: "module" });
    return new Promise((resolve, reject) => {
      this.pending = { resolve, reject, fraction };
      this.worker!.onmessage = (event: MessageEvent<DepthResponse>) => {
        const value = event.data;
        if (value.yield)
          this.scheduling?.request(() => this.worker?.postMessage({ type: "continue" }));
        if (value.progress) this.model.note(value.progress);
        if (value.fraction !== undefined) this.pending?.fraction?.(value.fraction);
        if (value.error || value.ready || value.result) {
          if (!value.ready) {
            this.scheduling?.dispose();
            this.scheduling = undefined;
          }
          const pending = this.pending;
          this.pending = undefined;
          if (value.error) {
            this.model.failed(Error(value.error));
            pending?.reject(Error(value.error));
          } else pending?.resolve(value.result);
        }
      };
      this.worker!.onerror = (event) => {
        this.scheduling?.dispose();
        this.scheduling = undefined;
        const pending = this.pending;
        this.pending = undefined;
        this.worker?.terminate();
        this.worker = undefined;
        pending?.reject(Error(event.message || "Depth worker failed."));
      };
      this.worker!.postMessage(message);
    });
  }
  async poster(original: Blob, video: VideoAsset) {
    const result = await this.request({ type: "poster", original, video });
    if (!result) throw Error("Depth worker returned no video preview.");
    return result;
  }
  async generate(original: Blob, video: VideoAsset | undefined, fraction: (value: number) => void) {
    if (this.pending) throw Error("Depth preparation is busy.");
    this.scheduling ??= createDepthScheduling();
    const result = await this.request({ type: "generate", original, video }, fraction);
    if (!result) throw Error("Depth worker returned no result.");
    return result;
  }
  cancel() {
    this.scheduling?.dispose();
    this.scheduling = undefined;
    this.worker?.terminate();
    this.worker = undefined;
    const pending = this.pending;
    this.pending = undefined;
    pending?.reject(new DOMException("Depth preparation cancelled.", "AbortError"));
  }
  dispose() {
    this.cancel();
    this.model.dispose();
  }
}
