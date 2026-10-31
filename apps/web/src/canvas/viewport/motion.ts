import { INITIAL_VIEW, zoomAt, type Point, type View } from "./view";

export interface ViewSource {
  read: () => View;
  subscribe: (listener: () => void) => () => void;
}
export interface MotionClock {
  now: () => number;
  request: (callback: FrameRequestCallback) => number;
  cancel: (handle: number) => void;
}
interface Transition {
  kind?: "wheel";
  wheelAge?: number;
  from: View;
  to: View;
  start: number;
  preserveOrigin?: boolean;
  waitingForFrame?: boolean;
  duration: number;
}
const WHEEL_LOOKAHEAD = 1.18;
const WHEEL_RESPONSE_MS = 64;
const WHEEL_FRAME_MAX_MS = 32;
const equal = (a: View, b: View) => a.x === b.x && a.y === b.y && a.zoom === b.zoom;

/** A shared interpolation fraction preserves the document point under a zoom anchor. */
export function interpolateView(from: View, to: View, progress: number): View {
  if (progress >= 1) return to;
  if (progress <= 0) return from;
  const eased = 1 - (1 - progress) ** 3;
  const zoom = Math.exp(Math.log(from.zoom) + (Math.log(to.zoom) - Math.log(from.zoom)) * eased);
  const fraction =
    Math.abs(to.zoom - from.zoom) < 1e-10 ? eased : (zoom - from.zoom) / (to.zoom - from.zoom);
  return { x: from.x + (to.x - from.x) * fraction, y: from.y + (to.y - from.y) * fraction, zoom };
}

/** RAF presentation state. React subscribers receive only settled poses. */
export class ViewMotion implements ViewSource {
  private current: View = INITIAL_VIEW;
  private settled: View = INITIAL_VIEW;
  private transition: Transition | null = null;
  private frame: number | null = null;
  private closed = false;
  private readonly listeners = new Set<() => void>();
  private readonly settledListeners = new Set<() => void>();
  constructor(
    private readonly options: {
      clock: MotionClock;
      constrain: (view: View) => View;
      reduced: () => boolean;
      duration?: number;
    },
  ) {}
  read = (): View => this.current;
  isMoving = (): boolean => this.transition !== null;
  readSettled = (): View => this.settled;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  subscribeSettled = (listener: () => void) => {
    this.settledListeners.add(listener);
    return () => {
      this.settledListeners.delete(listener);
    };
  };
  private publish(next: View, force = false) {
    if (!force && equal(this.current, next)) return;
    this.current = next;
    for (const listener of this.listeners) listener();
  }
  private settle() {
    if (equal(this.settled, this.current)) return;
    this.settled = this.current;
    for (const listener of this.settledListeners) listener();
  }
  private sample() {
    if (!this.transition || this.transition.waitingForFrame) return;
    if (this.transition.kind === "wheel") {
      const current = this.transition,
        now = this.options.clock.now();
      const elapsed = Math.min(WHEEL_FRAME_MAX_MS, Math.max(0, now - current.start));
      current.start = now;
      current.wheelAge = (current.wheelAge ?? 0) + elapsed;
      this.publish(
        this.options.constrain(
          interpolateView(this.current, current.to, elapsed / WHEEL_RESPONSE_MS),
        ),
      );
      return;
    }
    const duration = this.transition.duration;
    const progress =
      duration <= 0 ? 1 : (this.options.clock.now() - this.transition.start) / duration;
    const next = interpolateView(this.transition.from, this.transition.to, progress);
    this.publish(this.transition.preserveOrigin ? next : this.options.constrain(next));
  }
  private clearFrame() {
    if (this.frame !== null) this.options.clock.cancel(this.frame);
    this.frame = null;
  }
  private step = () => {
    this.frame = null;
    if (this.closed || !this.transition) return;
    if (this.options.reduced()) {
      this.finish();
      return;
    }
    const transition = this.transition;
    if (transition.kind === "wheel") {
      this.sample();
      if (this.transition === transition && (transition.wheelAge ?? 0) >= WHEEL_RESPONSE_MS)
        this.finish();
      else if (!this.closed && this.transition === transition)
        this.frame = this.options.clock.request(this.step);
      return;
    }
    // Structural reframing starts with the first visible frame, not a busy commit's clock.
    if (transition.waitingForFrame) {
      transition.start = this.options.clock.now();
      transition.waitingForFrame = false;
    }
    if (this.options.clock.now() - transition.start >= transition.duration) {
      this.finish();
    } else {
      this.sample();
      if (!this.closed && this.transition === transition && this.frame === null)
        this.frame = this.options.clock.request(this.step);
    }
  };
  jump(next: View, commit = true): void {
    if (this.closed) return;
    const moving = this.isMoving();
    this.clearFrame();
    this.transition = null;
    this.publish(this.options.constrain(next), moving);
    if (commit) this.settle();
  }
  /** Rebase a changed viewport origin before paint, preserving the old screen pose.
   * The owning resize adapter alone may start outside the new bounds and spring back.
   */
  reframe(next: View, commit = true): void {
    if (this.closed) return;
    const moving = this.isMoving();
    this.clearFrame();
    this.transition = null;
    this.publish(next, moving);
    if (commit) this.settle();
  }
  animateTo(next: View, preserveOrigin = false): void {
    if (this.closed) return;
    if (this.transition?.kind !== "wheel") this.sample();
    this.begin(next, preserveOrigin);
  }
  private begin(next: View, preserveOrigin = false): void {
    if (this.closed) return;
    this.clearFrame();
    const wasMoving = this.isMoving();
    const target = this.options.constrain(next);
    const duration = this.options.duration ?? (preserveOrigin ? 240 : 160);
    if (this.options.reduced() || equal(this.current, target) || duration <= 0) {
      this.jump(target);
      return;
    }
    this.transition = {
      from: this.current,
      to: target,
      start: this.options.clock.now(),
      preserveOrigin,
      waitingForFrame: preserveOrigin,
      duration,
    };
    if (!wasMoving) this.publish(this.current, true);
    this.frame = this.options.clock.request(this.step);
  }
  zoomBy(factor: number, anchor: Point): void {
    if (this.closed || !Number.isFinite(factor) || factor <= 0 || factor === 1) return;
    // Retarget from the last presented pose. Sampling here would mutate styles in
    // the input handler, immediately before viewport constraint reads.
    const direction = Math.sign(Math.log(factor)),
      previous = Math.sign((this.transition?.to.zoom ?? this.current.zoom) - this.current.zoom);
    const base =
      direction === previous ? (this.transition?.to.zoom ?? this.current.zoom) : this.current.zoom;
    const pendingStart = this.transition?.from === this.current ? this.transition.start : undefined;
    this.begin(zoomAt(this.current, (base * factor) / this.current.zoom, anchor));
    // Several wheel packets before the next RAF share one easing origin.
    if (pendingStart !== undefined && this.transition) this.transition.start = pendingStart;
  }
  /** Continuous input follows one nearby target; stalled packets cannot build a distant zoom backlog. */
  zoomWheel(factor: number, anchor: Point): void {
    if (this.closed || !Number.isFinite(factor) || factor <= 0 || factor === 1) return;
    if (this.options.reduced()) {
      this.jump(zoomAt(this.current, factor, anchor));
      return;
    }
    const pending = this.transition?.kind === "wheel" ? this.transition : null;
    const sameDirection =
      Math.sign(Math.log(factor)) ===
      Math.sign((pending?.to.zoom ?? this.current.zoom) - this.current.zoom);
    const base = sameDirection ? (pending?.to.zoom ?? this.current.zoom) : this.current.zoom;
    const desired = Math.max(
      this.current.zoom / WHEEL_LOOKAHEAD,
      Math.min(this.current.zoom * WHEEL_LOOKAHEAD, base * factor),
    );
    const target = zoomAt(this.current, desired / this.current.zoom, anchor);
    if (pending && equal(this.options.constrain(target), pending.to)) {
      pending.wheelAge = 0;
      return;
    }
    const start = pending?.start ?? this.options.clock.now();
    this.begin(target);
    if (this.transition) {
      this.transition.kind = "wheel";
      this.transition.wheelAge = 0;
      this.transition.start = start;
    }
  }
  stop(commit = true): void {
    const moving = this.isMoving();
    if (this.transition?.kind !== "wheel") this.sample();
    this.clearFrame();
    this.transition = null;
    if (moving) this.publish(this.current, true);
    if (commit) this.settle();
  }
  finish(): void {
    if (this.transition) this.jump(this.transition.to);
  }
  activate(): void {
    this.closed = false;
  }
  dispose(): void {
    this.clearFrame();
    this.transition = null;
    this.closed = true;
    this.listeners.clear();
    this.settledListeners.clear();
  }
}
