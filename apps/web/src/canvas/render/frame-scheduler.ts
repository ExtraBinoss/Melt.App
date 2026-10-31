/** One cancellable job. Playing frames already follow the transport's RAF clock. */
export class CanvasFrameScheduler {
  private cancellation: (() => void) | null = null;
  get pending(): boolean {
    return this.cancellation !== null;
  }
  schedule(playback: boolean, callback: () => void): void {
    if (this.pending) return;
    let active = true;
    let frame: number | undefined;
    const run = () => {
      if (!active) return;
      active = false;
      this.cancellation = null;
      callback();
    };
    this.cancellation = () => {
      active = false;
      if (frame !== undefined) cancelAnimationFrame(frame);
    };
    if (playback) queueMicrotask(run);
    else frame = requestAnimationFrame(run);
  }
  clear(): void {
    this.cancellation?.();
    this.cancellation = null;
  }
}
