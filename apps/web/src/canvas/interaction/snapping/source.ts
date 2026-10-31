import type { RotationGuide } from "./rotation";
import type { EnginePort, SnapCue } from "@musart/core";
import { isGestureOriginCurrent, type GestureOrigin } from "../gesture-origin";
export interface SnapSnapshot {
  origin: GestureOrigin | null;
  cues: readonly SnapCue[];
  rotation?: RotationGuide;
}
const empty: SnapSnapshot = Object.freeze({ origin: null, cues: Object.freeze([]) });

/** Gesture-only presentation. No React state, document mutation or undo entry. */
export class SnapFeedback {
  private snapshot = empty;
  private readonly listeners = new Set<() => void>();
  constructor(private readonly engine?: EnginePort) {}
  read = (): SnapSnapshot => this.snapshot;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  set(origin: GestureOrigin, cues: readonly SnapCue[], rotation?: RotationGuide): void {
    if (this.engine && !isGestureOriginCurrent(this.engine, origin)) {
      this.clear();
      return;
    }
    if (!cues.length && !rotation) {
      this.clear();
      return;
    }
    this.snapshot = Object.freeze({
      origin: Object.freeze({ ...origin }),
      cues: Object.freeze([...cues]),
      ...(rotation ? { rotation: Object.freeze(rotation) } : {}),
    });
    for (const listener of this.listeners) listener();
  }
  clear = (): void => {
    if (this.snapshot === empty) return;
    this.snapshot = empty;
    for (const listener of this.listeners) listener();
  };
}
