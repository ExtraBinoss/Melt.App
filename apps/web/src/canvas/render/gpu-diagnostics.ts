import type { WebGPURenderer } from "three/webgpu";

/** Preserve Three's native loss handler and restore it only while this observer owns the slot. */
export function observeRendererLoss(
  renderer: WebGPURenderer,
  onLoss: WebGPURenderer["onDeviceLost"],
): () => void {
  const previous = renderer.onDeviceLost;
  const lost: WebGPURenderer["onDeviceLost"] = (info) => {
    try {
      previous?.call(renderer, info);
    } finally {
      onLoss(info);
    }
  };
  renderer.onDeviceLost = lost;
  return () => {
    if (renderer.onDeviceLost === lost) renderer.onDeviceLost = previous;
  };
}

/** Bound diagnostic DOM work independently of drawing; retain the latest state after a burst. */
export class CanvasGpuDiagnostics {
  private last = -Infinity;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private closed = false;
  constructor(
    private readonly read: () => unknown,
    private readonly publish: (json: string) => void,
    private readonly ownsCanvas: () => boolean,
    private readonly now = () => performance.now(),
  ) {}
  request(): void {
    if (this.closed || !this.ownsCanvas()) return;
    const remaining = 250 - (this.now() - this.last);
    if (remaining <= 0) this.flush();
    else
      this.timer ??= setTimeout(() => {
        this.timer = null;
        this.flush();
      }, remaining);
  }
  private flush(): void {
    if (this.closed || !this.ownsCanvas()) return;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.last = this.now();
    this.publish(JSON.stringify(this.read()));
  }
  dispose(): void {
    if (this.closed) return;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.flush();
    this.closed = true;
  }
}

export function rendererMemoryDiagnostics(renderer: WebGPURenderer) {
  const memory = renderer.info?.memory;
  return memory
    ? {
        uniformBuffers: memory.uniformBuffers,
        uniformBytes: memory.uniformBuffersSize,
        nodePrograms: memory.programs,
        rendererTargets: memory.renderTargets,
      }
    : {};
}
