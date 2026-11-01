import type { MotionFramePlan } from "@musart/core";
import type { GpuStats } from "@musart/render";
import "./video-playback";

const LIMIT = 256;
const round = (n: number) => Math.round(n * 100) / 100;
function summary(values: readonly number[]) {
  if (!values.length) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  return {
    p50: round(sorted[Math.floor(sorted.length * 0.5)]!),
    p95: round(sorted[Math.floor(sorted.length * 0.95)]!),
    max: round(sorted.at(-1)!),
  };
}
function push(values: number[], value: number) {
  if (values.length === LIMIT) values.shift();
  values.push(value);
}

/** No interval, pixel reads or GPU queries. Only active draws publish a bounded two-second report. */
export class PlaybackPipelineDiagnostics {
  private composition = "";
  private projectId: string | undefined;
  private began = 0;
  private last = 0;
  private frames = 0;
  private frameMs: number[] = [];
  private gaps: number[] = [];
  private gpuWait: number[] = [];
  private sourceGaps = 0;
  private formats: Record<string, number> = {};
  private observer: PerformanceObserver | null = null;
  private baseline: GpuStats | null = null;
  private disposed = false;
  private slowest: { frameMs: number; time: MotionFramePlan["time"] } | undefined;
  constructor(
    private readonly surface: string,
    private readonly stats: () => GpuStats | null,
    private readonly log = (detail: Record<string, unknown>) =>
      console.info("[Melt pipeline]", detail),
    private readonly now = () => performance.now(),
  ) {
    if (typeof PerformanceObserver !== "undefined") {
      this.observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const detail = (entry as PerformanceMeasure).detail;
          if (detail?.compositionId !== this.composition) continue;
          if (entry.name === "Melt frame: gpu-wait") push(this.gpuWait, entry.duration);
          if (entry.name === "Melt frame: video") {
            if (detail.action === "gap") this.sourceGaps++;
            if (
              typeof detail.nativeFormat === "string" &&
              detail.nativeFormat.length <= 16 &&
              Object.keys(this.formats).length < 16
            )
              this.formats[detail.nativeFormat] = (this.formats[detail.nativeFormat] ?? 0) + 1;
          }
        }
      });
      this.observer.observe({ entryTypes: ["measure", "mark"] });
    }
  }
  record(
    plan: MotionFramePlan | undefined,
    started: number,
    context?: { projectId?: string; name?: string },
  ): void {
    if (!plan || this.disposed) return;
    const now = this.now();
    if (plan.compositionId !== this.composition || this.projectId !== context?.projectId) {
      this.composition = plan.compositionId;
      this.projectId = context?.projectId;
      this.began = this.last = now;
      this.frames = 0;
      this.frameMs = [];
      this.gaps = [];
      this.gpuWait = [];
      this.sourceGaps = 0;
      this.formats = {};
      this.slowest = undefined;
      this.baseline = this.stats();
      this.log({
        surface: this.surface,
        ...context,
        compositionId: this.composition,
        stage: "first-frame",
        frameMs: round(now - started),
      });
      return;
    }
    push(this.frameMs, now - started);
    if (!this.slowest || now - started > this.slowest.frameMs)
      this.slowest = { frameMs: round(now - started), time: plan.time };
    push(this.gaps, now - this.last);
    this.frames++;
    this.last = now;
    if (now - this.began < 2000) return;
    const stats = this.stats(),
      before = this.baseline;
    const video = stats?.video,
      previous = before?.video;
    const count = Math.max(1, (stats?.frames ?? 0) - (before?.frames ?? 0));
    const phases = Object.fromEntries(
      Object.entries(stats?.profile ?? {}).map(([name, values]) => [
        name,
        summary(values.slice(-Math.min(count, LIMIT))),
      ]),
    );
    this.log({
      surface: this.surface,
      ...context,
      compositionId: this.composition,
      stage: "playback",
      time: plan.time,
      windowMs: round(now - this.began),
      completedPreparationsPerSecond: round((this.frames * 1000) / (now - this.began)),
      frameMs: summary(this.frameMs),
      drawIntervalMs: summary(this.gaps),
      gpuQueueWaitMs: summary(this.gpuWait),
      slowestPose: this.slowest,
      // Compose includes CPU submission and queue wait. It is not isolated shader execution.
      preparationPhasesMs: phases,
      text: stats?.text
        ? {
            ...stats.text,
            profile: Object.fromEntries(
              Object.entries(stats.text.profile ?? {}).map(([phase, values]) => [
                phase,
                summary(values),
              ]),
            ),
          }
        : undefined,
      video: video
        ? {
            decoders: video.playback.length,
            requests: video.timings.requests - (previous?.timings.requests ?? 0),
            uploads: video.uploads
              ? video.uploads.acknowledgements - (previous?.uploads?.acknowledgements ?? 0)
              : undefined,
            gpuReuses: video.timings.gpuReuses - (previous?.timings.gpuReuses ?? 0),
            decodeWaitSumMs: round(video.timings.decodeMs - (previous?.timings.decodeMs ?? 0)),
            sourceGaps: this.sourceGaps,
            nativeFormats: this.formats,
            uploadSubmissionMs: round(
              video.timings.prepareSubmissionMs - (previous?.timings.prepareSubmissionMs ?? 0),
            ),
            decodedBytes: video.decoded.bytes,
            decodedPeakBytes: video.decoded.peakBytes,
          }
        : undefined,
      gpu: stats
        ? {
            submissions: stats.submission,
            passes: stats.passes - (before?.passes ?? 0),
            cacheHits: stats.cacheHits - (before?.cacheHits ?? 0),
            cacheBytes: stats.cacheBytes,
            maxBytes: stats.maxBytes,
          }
        : undefined,
    });
    this.baseline = stats;
    this.began = now;
    this.frames = 0;
    this.frameMs = [];
    this.gaps = [];
    this.gpuWait = [];
    this.sourceGaps = 0;
    this.formats = {};
    this.slowest = undefined;
  }
  dispose(): void {
    this.disposed = true;
    this.observer?.disconnect();
    this.observer = null;
    this.frameMs = this.gaps = this.gpuWait = [];
    this.baseline = null;
  }
  pause(): void {
    this.composition = "";
  }
}

export function createPlaybackPipelineDiagnostics(surface: string, stats: () => GpuStats | null) {
  return import.meta.env.DEV ? new PlaybackPipelineDiagnostics(surface, stats) : null;
}
