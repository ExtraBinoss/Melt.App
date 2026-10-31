/** One buffering lease per pending canvas frame. Fast frames keep their wall-clock
 * time; a cold shader/decode stall cannot accumulate a burst of unseen playback. */
export class CanvasPlaybackBuffering {
  private release: (() => void) | null = null;
  constructor(private readonly hold?: () => () => void) {}
  pending(playing: boolean): void {
    if (!playing) this.presented();
    else this.release ??= this.hold?.() ?? null;
  }
  presented(): void {
    const release = this.release;
    this.release = null;
    release?.();
  }
}
