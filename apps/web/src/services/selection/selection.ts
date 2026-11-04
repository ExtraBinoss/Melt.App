import type { SelectionPrompt, ObjectCandidate, SelectionPoint } from "./prompts";
import { BACKGROUND_MODEL } from "./model/manifest";
import { LocalModelManager } from "./model/manager";
import type { ModelDownloadEvent } from "./model/contract";

export type SelectionRequest =
  | { id: number; type: "prepare"; background?: boolean }
  | { id: number; type: "background"; dataUrl: string; encode?: boolean }
  | { id: number; type: "prompt"; dataUrl: string; prompt: SelectionPrompt }
  | { id: number; type: "scan"; dataUrl: string }
  | { id: number; type: "segment"; dataUrl: string; x: number; y: number; encode?: boolean }
  | {
      id: number;
      type: "wand";
      pixels: Uint8ClampedArray;
      width: number;
      height: number;
      x: number;
      y: number;
      tolerance: number;
    };
export interface MaskResult {
  seed?: SelectionPoint;
  candidates?: ObjectCandidate[];
  score?: number;
  data: Uint8ClampedArray;
  width: number;
  height: number;
}
export interface EncodedMaskResult {
  seed?: SelectionPoint;
  blob: Blob;
  width: number;
  height: number;
}
type SelectionResult = MaskResult | EncodedMaskResult;
export type SelectionResponse =
  | { id: number; progress: ModelDownloadEvent }
  | { id: number; result: SelectionResult | null }
  | { id: number; error: string };
export interface WorkerPort {
  postMessage(message: SelectionRequest, transfer?: Transferable[]): void;
  terminate(): void;
  onmessage: ((event: MessageEvent<SelectionResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  onmessageerror?: ((event: MessageEvent<unknown>) => void) | null;
}
/** A worker owns the model and one image embedding; one active job prevents unbounded queues. */
export class SelectionClient {
  readonly model: LocalModelManager;
  readonly backgroundModel: LocalModelManager;
  private worker: WorkerPort | undefined;
  private nextId = 0;
  private workerGeneration = 0;
  get generation(): number {
    return this.workerGeneration;
  }
  private pending:
    | {
        id: number;
        type: SelectionRequest["type"];
        resolve: (result: SelectionResult | null) => void;
        reject: (error: Error) => void;
      }
    | undefined;
  constructor(
    private readonly createWorker = (): WorkerPort =>
      new Worker(new URL("./selection.worker.ts", import.meta.url), { type: "module" }),
  ) {
    this.backgroundModel = new LocalModelManager(
      {
        prepare: () => this.prepare(true),
        cancel: () => this.resetWorker(),
      },
      BACKGROUND_MODEL,
    );
    this.model = new LocalModelManager({
      prepare: () => this.prepare(),
      cancel: () => this.resetWorker(),
    });
  }
  private connect() {
    if (this.worker) return this.worker;
    this.worker = this.createWorker();
    this.worker.onmessage = ({ data }) => {
      if (!this.pending || this.pending.id !== data.id) return;
      if ("progress" in data) {
        (this.pending.type === "background" ||
        (this.pending.type === "prepare" && this.preparingBackground)
          ? this.backgroundModel
          : this.model
        ).note(data.progress);
        return;
      }
      const pending = this.pending;
      this.pending = undefined;
      if ("error" in data) {
        this.model.failed(data.error);
        this.backgroundModel.failed(data.error);
        pending.reject(new Error(data.error));
      } else {
        if (pending.type !== "wand")
          (pending.type === "background" || (pending.type === "prepare" && this.preparingBackground)
            ? this.backgroundModel
            : this.model
          ).ready();
        pending.resolve(data.result);
      }
    };
    this.worker.onerror = (event) => {
      this.model.failed(event.message || "The model worker failed.");
      this.pending?.reject(new Error(event.message || "Le worker de sélection a échoué."));
      this.pending = undefined;
      this.resetWorker();
    };
    this.worker.onmessageerror = () => {
      const error = new Error("The selection worker response could not be decoded.");
      this.model.failed(error);
      this.pending?.reject(error);
      this.pending = undefined;
      this.resetWorker();
    };
    return this.worker;
  }
  request(request: SelectionRequest): Promise<SelectionResult | null> {
    if (this.pending) return Promise.reject(new Error("Une sélection est déjà en cours."));
    return new Promise((resolve, reject) => {
      const worker = this.connect();
      if (request.type !== "wand") {
        const background =
          request.type === "background" || (request.type === "prepare" && request.background);
        (background ? this.model : this.backgroundModel).deactivate();
        (background ? this.backgroundModel : this.model).start();
      }
      this.pending = { id: request.id, type: request.type, resolve, reject };
      try {
        worker.postMessage(
          request,
          request.type === "wand" ? [request.pixels.buffer as ArrayBuffer] : [],
        );
      } catch (error) {
        this.pending = undefined;
        reject(error);
      }
    });
  }
  private preparingBackground = false;
  async prepare(background = false) {
    if (this.pending) throw Error("A selection is already running.");
    this.preparingBackground = background;
    await this.request({
      id: ++this.nextId,
      type: "prepare",
      ...(background ? { background: true } : {}),
    });
  }
  async background(dataUrl: string): Promise<MaskResult> {
    const result = await this.request({ id: ++this.nextId, type: "background", dataUrl });
    if (!result || !("data" in result)) throw Error("Background removal mask is missing.");
    return result;
  }
  async backgroundEncoded(dataUrl: string): Promise<EncodedMaskResult> {
    const result = await this.request({
      id: ++this.nextId,
      type: "background",
      dataUrl,
      encode: true,
    });
    if (!result || !("blob" in result)) throw Error("Background removal mask is missing.");
    return result;
  }
  async segment(dataUrl: string, x: number, y: number) {
    const result = await this.request({ id: ++this.nextId, type: "segment", dataUrl, x, y });
    if (!result || !("data" in result)) throw new Error("Masque absent.");
    return result;
  }
  /** PNG encoding remains in the worker, away from editor input and painting. */
  async segmentEncoded(dataUrl: string, x: number, y: number): Promise<EncodedMaskResult> {
    const result = await this.request({
      id: ++this.nextId,
      type: "segment",
      dataUrl,
      x,
      y,
      encode: true,
    });
    if (!result || !("blob" in result)) throw new Error("Masque absent.");
    return result;
  }
  async prompt(dataUrl: string, prompt: SelectionPrompt): Promise<MaskResult> {
    const result = await this.request({ id: ++this.nextId, type: "prompt", dataUrl, prompt });
    if (!result || !("data" in result)) throw Error("Object selection mask is missing.");
    return result;
  }
  async scan(dataUrl: string): Promise<MaskResult> {
    const result = await this.request({ id: ++this.nextId, type: "scan", dataUrl });
    if (!result || !("data" in result)) throw Error("Object detection mask is missing.");
    return result;
  }
  cancel() {
    this.model.cancel();
    this.backgroundModel.cancel();
  }
  async wand(
    pixels: Uint8ClampedArray,
    width: number,
    height: number,
    x: number,
    y: number,
    tolerance: number,
  ) {
    const result = await this.request({
      id: ++this.nextId,
      type: "wand",
      pixels,
      width,
      height,
      x,
      y,
      tolerance,
    });
    if (!result || !("data" in result)) throw new Error("Masque absent.");
    return result;
  }
  private resetWorker() {
    this.workerGeneration++;
    this.model.deactivate();
    this.backgroundModel.deactivate();
    this.pending?.reject(new DOMException("Sélection annulée.", "AbortError"));
    this.pending = undefined;
    if (this.worker) {
      this.worker.onmessage = null;
      this.worker.onerror = null;
      this.worker.onmessageerror = null;
      this.worker.terminate();
    }
    this.worker = undefined;
  }
  dispose() {
    this.resetWorker();
    this.model.dispose();
    this.backgroundModel.dispose();
  }
}
