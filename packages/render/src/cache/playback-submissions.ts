import type { WebGPURenderer } from "three/webgpu";
import { acknowledgeGpuWork } from "./acknowledgement";
/** CPU publication is pipelined; real native completions bound GPU work and teardown.
 * Eight frames tolerate delayed browser completion callbacks without a fence per presented frame.
 */
export class PlaybackSubmissions {
  private readonly pending = new Set<Promise<void>>();
  private failure: unknown;
  private closed = false;
  private peak = 0;
  readonly limit = 8;
  constructor(private readonly renderer: WebGPURenderer) {}
  private assertOpen() {
    if (this.closed) throw Error("Playback submissions are closed.");
    if (this.failure) throw this.failure;
  }
  async admit(signal?: AbortSignal): Promise<void> {
    this.assertOpen();
    signal?.throwIfAborted();
    while (this.pending.size >= this.limit) {
      const ready = Promise.race(this.pending);
      if (!signal) await ready;
      else {
        let abort!: () => void;
        const aborted = new Promise<never>((_, reject) => {
          abort = () => reject(signal.reason);
          signal.addEventListener("abort", abort, { once: true });
          if (signal.aborted) abort();
        });
        try {
          await Promise.race([ready, aborted]);
        } finally {
          signal.removeEventListener("abort", abort);
        }
      }
      this.assertOpen();
      signal?.throwIfAborted();
    }
  }
  submitted(): void {
    this.assertOpen();
    if (this.pending.size >= this.limit) throw Error("Playback submission admission exceeded.");
    const acknowledgement = acknowledgeGpuWork(this.renderer)
      .catch((error: unknown) => {
        this.failure ??= error;
      })
      .finally(() => {
        this.pending.delete(acknowledgement);
      });
    this.pending.add(acknowledgement);
    this.peak = Math.max(this.peak, this.pending.size);
  }
  stats() {
    return { pending: this.pending.size, peak: this.peak, limit: this.limit };
  }
  async dispose(): Promise<void> {
    this.closed = true;
    await Promise.all(this.pending);
    if (this.failure) throw this.failure;
  }
}
