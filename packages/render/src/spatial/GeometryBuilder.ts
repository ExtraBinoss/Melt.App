import { BufferAttribute, BufferGeometry } from "three/webgpu";
import type { GeometryPayload, SpatialGeometryJob } from "./geometry-model";
/** One bounded preparation worker per retained compositor. No rendering or GPU readback. */
export class GeometryBuilder {
  private worker: Worker | null = null;
  private sequence = 0;
  private readonly morphs = new Set<string>();
  private disposed = false;
  private readonly pending = new Map<
    number,
    { resolve(value: BufferGeometry): void; reject(error: unknown): void }
  >();
  async build(job: SpatialGeometryJob): Promise<BufferGeometry> {
    if (this.disposed) throw new Error("3D geometry builder is disposed");
    if (typeof Worker === "undefined") {
      const { buildSpatialGeometry } = await import("./geometry-build");
      return buildSpatialGeometry(job);
    }
    if (this.pending.size >= 4) throw new Error("3D preparation queue is full");
    if (!this.worker) {
      this.worker = new Worker(new URL("./geometry.worker.ts", import.meta.url), {
        type: "module",
      });
      this.worker.onmessage = (
        event: MessageEvent<{ id: number; value?: GeometryPayload; error?: string }>,
      ) => {
        const task = this.pending.get(event.data.id);
        if (!task) return;
        this.pending.delete(event.data.id);
        if (event.data.error || !event.data.value) {
          this.morphs.clear();
          task.reject(new Error(event.data.error ?? "Invalid 3D geometry reply"));
        } else {
          const geometry = new BufferGeometry();
          for (const attribute of event.data.value.attributes)
            geometry.setAttribute(
              attribute.name,
              new BufferAttribute(new Float32Array(attribute.buffer), attribute.itemSize),
            );
          if (event.data.value.index)
            geometry.setIndex(new BufferAttribute(new Uint32Array(event.data.value.index), 1));
          task.resolve(geometry);
        }
      };
      this.worker.onerror = (event) => {
        event.preventDefault();
        this.fail(new Error(event.message || "3D worker failed"));
      };
      this.worker.onmessageerror = () => this.fail(new Error("Invalid 3D worker message"));
    }
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      let sent = job;
      if (job.morph) {
        if (this.morphs.has(job.morph.key))
          sent = { ...job, morph: { ...job.morph, definition: undefined } };
        this.morphs.delete(job.morph.key);
        this.morphs.add(job.morph.key);
        if (this.morphs.size > 8) this.morphs.delete(this.morphs.values().next().value!);
      }
      this.worker!.postMessage({ id, job: sent });
    });
  }
  private fail(error: unknown) {
    this.worker?.terminate();
    this.worker = null;
    for (const task of this.pending.values()) task.reject(error);
    this.pending.clear();
    this.morphs.clear();
  }
  dispose() {
    this.disposed = true;
    this.fail(new DOMException("3D preparation disposed", "AbortError"));
  }
}
