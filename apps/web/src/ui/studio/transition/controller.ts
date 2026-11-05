import type { WorkspaceMode } from "../../../services/projects/preferences/model";

export interface WorkspaceTransitionState {
  mode: WorkspaceMode;
  target: WorkspaceMode;
  phase: "idle" | "exiting" | "preparing" | "entering";
}
export interface WorkspaceTransitionPorts {
  animate(direction: "exit" | "enter", signal: AbortSignal): Promise<void>;
  ready(signal: AbortSignal): Promise<void>;
  restore(): void;
}

/** Only phase boundaries notify React; superseded preparation can never reveal stale chrome. */
export class WorkspaceTransition {
  private state: WorkspaceTransitionState;
  private readonly listeners = new Set<() => void>();
  private operation: AbortController | null = null;

  constructor(
    mode: WorkspaceMode,
    private readonly ports: WorkspaceTransitionPorts,
  ) {
    this.state = { mode, target: mode, phase: "idle" };
  }
  read = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(patch: Partial<WorkspaceTransitionState>) {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }
  request(target: WorkspaceMode) {
    if (this.state.target === target) return;
    this.operation?.abort();
    const operation = new AbortController();
    this.operation = operation;
    this.publish({ target });
    void this.run(target, operation.signal);
  }
  private async run(target: WorkspaceMode, signal: AbortSignal) {
    if (this.state.mode !== target) {
      this.publish({ phase: "exiting" });
      await this.ports.animate("exit", signal);
      if (signal.aborted) return;
      this.publish({ mode: target, phase: "preparing" });
    }
    // Even a reversal into retained chrome waits for its actual layout and canvas.
    await this.ports.ready(signal);
    if (signal.aborted) return;
    this.publish({ phase: "entering" });
    await this.ports.animate("enter", signal);
    if (signal.aborted) return;
    this.ports.restore();
    this.publish({ phase: "idle" });
    this.operation = null;
  }
  dispose() {
    this.operation?.abort();
    this.operation = null;
    this.ports.restore();
  }
}
