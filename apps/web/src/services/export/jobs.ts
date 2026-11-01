import type { EnginePort, EditorEngine } from "@musart/core";
import { ExportMeasurements, type ExportSizeKey } from "./measurements";

export type ExportKind = "image" | "motion" | "timelapse";
export interface ExportJob {
  kind: ExportKind;
  projectId: string;
  name: string;
  status: "running" | "cancelling" | "complete" | "cancelled" | "failed";
  percent: number;
  error?: unknown;
  sizeKey?: ExportSizeKey;
  estimatedBytes?: number;
  bytes?: number;
}
interface ExportWork {
  signal: AbortSignal;
  progress: (fraction: number) => void;
  estimate: (bytes: number) => void;
}
const sessions = new WeakMap<EnginePort, ExportJobs>();
const active = new Set<ExportJobs>();

/** A session owns one export independently of dialogs, with cancellation held through cleanup. */
export class ExportJobs {
  readonly measurements = new ExportMeasurements();
  constructor(private readonly engine?: EnginePort) {}
  private value: ExportJob | null = null;
  private serial = 0;
  get sequence() {
    return this.serial;
  }
  private listeners = new Set<() => void>();
  private controller: AbortController | null = null;
  private work: Promise<void> | null = null;
  read = () => this.value;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  get pending() {
    return this.value?.status === "running" || this.value?.status === "cancelling";
  }
  private publish(value: ExportJob) {
    this.value = Object.freeze(value);
    for (const listener of this.listeners) listener();
  }
  start(
    job: Pick<ExportJob, "kind" | "projectId" | "name" | "sizeKey">,
    task: (work: ExportWork) => Promise<void | { bytes: number }>,
  ) {
    if (this.pending) return false;
    this.serial++;
    const controller = new AbortController();
    this.controller = controller;
    active.add(this);
    this.publish({ ...job, status: "running", percent: 0 });
    const observe = this.engine as
      | (EnginePort & Partial<Pick<EditorEngine, "subscribeCommitInfo">>)
      | undefined;
    const stop = observe?.subscribe(() => {
      if (observe.getSnapshot().project.id !== job.projectId) this.cancel();
    });
    const stopLoads = observe?.subscribeCommitInfo?.((event) => {
      if (event.kind === "load") this.cancel();
    });
    this.work = (async () => {
      let result: ExportJob;
      try {
        let estimatedBytes: number | undefined;
        const delivered = await task({
          signal: controller.signal,
          estimate: (bytes) => {
            if (Number.isFinite(bytes) && bytes > 0) estimatedBytes = Math.ceil(bytes);
          },
          progress: (fraction) => {
            if (
              this.controller !== controller ||
              !Number.isFinite(fraction) ||
              controller.signal.aborted
            )
              return;
            const percent = Math.max(this.value!.percent, Math.min(99, Math.floor(fraction * 100)));
            if (percent !== this.value!.percent)
              this.publish({ ...this.value!, percent, estimatedBytes });
          },
        });
        controller.signal.throwIfAborted();
        if (delivered && (!Number.isSafeInteger(delivered.bytes) || delivered.bytes <= 0))
          throw new Error("The export produced an invalid file size.");
        if (delivered && job.sizeKey) this.measurements.record(job.sizeKey, delivered.bytes);
        result = {
          ...job,
          sizeKey: undefined,
          status: "complete",
          percent: 100,
          bytes: delivered?.bytes,
        };
      } catch (error) {
        if (!controller.signal.aborted)
          console.error(
            "[Melt export failed]",
            { kind: job.kind, projectId: job.projectId, name: job.name },
            error,
          );
        result = {
          ...job,
          sizeKey: undefined,
          status: controller.signal.aborted ? "cancelled" : "failed",
          percent: this.value!.percent,
          ...(controller.signal.aborted ? {} : { error }),
        };
      } finally {
        stop?.();
        stopLoads?.();
        active.delete(this);
        this.controller = null;
      }
      this.publish(result);
    })();
    return true;
  }
  cancel = () => {
    if (this.pending && this.controller && !this.controller.signal.aborted) {
      this.publish({ ...this.value!, status: "cancelling" });
      this.controller.abort();
    }
  };
  async stop() {
    this.cancel();
    await this.work;
  }
}
export function getExportJobs(engine: EnginePort): ExportJobs {
  let jobs = sessions.get(engine);
  if (!jobs) {
    jobs = new ExportJobs(engine);
    sessions.set(engine, jobs);
  }
  return jobs;
}
export const hasActiveExports = () => [...active].some((jobs) => jobs.pending);
export async function stopAllExports() {
  await Promise.all([...active].map((jobs) => jobs.stop()));
}
