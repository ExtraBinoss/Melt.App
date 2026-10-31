export const PLAYBACK_FRAME_CREDIT_MS = 1000 / 30;

/** Unwrapped presentation time, sampled by a caller; no timers or authored document state. */
export class BufferedPlaybackClock {
  private playing = false;
  private anchorTime = 0;
  private anchorWall = 0;
  private sampled = 0;
  private readonly holds = new Set<symbol>();
  constructor(private readonly now: () => number) {}
  get running(): boolean {
    return this.playing;
  }
  get blocked(): boolean {
    return this.holds.size > 0;
  }
  start(seconds: number): void {
    this.stop(seconds);
    this.playing = true;
    this.anchorWall = this.now();
  }
  stop(seconds = this.sampled): void {
    if (!Number.isFinite(seconds) || seconds < 0) throw new RangeError("Invalid playback time.");
    this.playing = false;
    this.holds.clear();
    this.anchorTime = this.sampled = seconds;
  }
  read(): number {
    if (this.playing && !this.blocked)
      this.sampled = this.anchorTime + Math.max(0, this.now() - this.anchorWall) / 1000;
    return this.sampled;
  }
  /** Last release resumes the sampled pose. Long stalls never create a catch-up burst. */
  hold(frameCreditMs = 0): (delayMs?: number) => boolean {
    if (!Number.isFinite(frameCreditMs) || frameCreditMs < 0 || frameCreditMs > 100)
      throw new RangeError("Invalid playback frame budget.");
    const heldAt = this.now();
    if (!this.playing) return () => false;
    if (!this.blocked) this.anchorTime = this.sampled;
    const token = Symbol("playback-buffering");
    this.holds.add(token);
    return (delayMs = 0) => {
      if (!Number.isFinite(delayMs) || delayMs < 0)
        throw new RangeError("Invalid playback clock delay.");
      if (!this.holds.delete(token) || this.blocked || !this.playing) return false;
      const now = this.now();
      this.anchorWall = now + delayMs - Math.min(frameCreditMs, Math.max(0, now - heldAt));
      return true;
    };
  }
}
