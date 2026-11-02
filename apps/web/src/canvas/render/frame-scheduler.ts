/** One cancellable job. Certified input and playback do not wait for a second RAF. */
export class CanvasFrameScheduler {
  private cancellation: (() => void) | null = null;
  get pending(): boolean {
    return this.cancellation !== null;
  }
  schedule(urgent: boolean, callback: () => void): void {
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
    if (urgent) queueMicrotask(run);
    else frame = requestAnimationFrame(run);
  }
  clear(): void {
    this.cancellation?.();
    this.cancellation = null;
  }
}
