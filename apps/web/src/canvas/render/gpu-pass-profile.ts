import type { WebGPURenderer } from "three/webgpu";

interface TimestampBackend {
  hasTimestampQuery(uid: string): boolean;
  getTimestamp(uid: string): number;
}
type Batch = { entries: Map<string, string>; complete: boolean };

/** Three owns timestamp allocation/readback. This adapter only labels its render UIDs. */
export class GpuPassProfile {
  private batch: Batch | null = null;
  private restore: (() => void) | null = null;
  private readonly backend: TimestampBackend | null;
  constructor(private readonly renderer: WebGPURenderer) {
    const backend = renderer.backend;
    this.backend =
      "hasTimestampQuery" in backend &&
      typeof backend.hasTimestampQuery === "function" &&
      "getTimestamp" in backend &&
      typeof backend.getTimestamp === "function"
        ? (backend as typeof backend & TimestampBackend)
        : null;
  }
  get supported(): boolean {
    return this.backend !== null && typeof this.renderer.inspector?.beginRender === "function";
  }
  open(): void {
    this.close();
    if (!this.supported) return;
    const inspector = this.renderer.inspector,
      previous = inspector.beginRender.bind(inspector);
    const descriptor = Object.getOwnPropertyDescriptor(inspector, "beginRender");
    const hook: typeof inspector.beginRender = (uid, scene, camera, target) => {
      const batch = this.batch;
      if (batch) {
        if (batch.entries.size >= 512 || batch.entries.has(uid)) batch.complete = false;
        else {
          const name = !target
            ? "display"
            : scene.name.startsWith("melt:")
              ? scene.name.slice(5)
              : "other";
          const material = scene.children[0] && Reflect.get(scene.children[0], "material");
          const stage = material && typeof material.name === "string" ? material.name : "";
          batch.entries.set(uid, name === "effects" && stage ? `${name}/${stage}` : name);
        }
      }
      previous(uid, scene, camera, target);
    };
    inspector.beginRender = hook;
    this.restore = () => {
      if (inspector.beginRender !== hook) return;
      if (descriptor) Object.defineProperty(inspector, "beginRender", descriptor);
      else Reflect.deleteProperty(inspector, "beginRender");
    };
  }
  begin(): void {
    this.batch = { entries: new Map(), complete: true };
  }
  take(): Batch | null {
    const batch = this.batch;
    this.batch = null;
    return batch;
  }
  resolve(batch: Batch | null): Readonly<Record<string, number>> | null {
    if (!this.backend || !batch?.complete || !batch.entries.size) return null;
    const result: Record<string, number> = {};
    for (const [uid, name] of batch.entries) {
      if (!this.backend.hasTimestampQuery(uid)) return null;
      const duration = this.backend.getTimestamp(uid);
      if (!Number.isFinite(duration) || duration < 0) return null;
      result[name] = (result[name] ?? 0) + duration;
      if (Object.keys(result).length > 64) return null;
    }
    return Object.freeze(result);
  }
  close(): void {
    this.batch = null;
    this.restore?.();
    this.restore = null;
  }
}
