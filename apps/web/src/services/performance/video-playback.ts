import type { MotionTime } from "@musart/core";

type Trace = {
  compositionId?: string;
  layerId?: string;
  assetId?: string;
  sourceName?: string;
  sourceDuration?: MotionTime;
  time?: MotionTime;
  sourceTime?: MotionTime;
  pts?: MotionTime | null;
  playing?: boolean;
  projectId?: string;
  action?: string;
  reason?: string;
  proxy?: boolean;
};
type Sample = { source: Trace; at: number; requested: number; decoded: number; duration: number };
type Cycle = {
  last: Sample;
  began: number;
  checkpoint: number;
  requested: number;
  decoded: number;
  frames: number;
};
const seconds = (time?: MotionTime | null): number | null =>
  time && Number.isFinite(time.value) && Number.isFinite(time.rate) && time.rate > 0
    ? time.value / time.rate
    : null;
const round = (value: number) => Math.round(value * 1000) / 1000;

/** Bounded dev diagnostics. Uses presented-frame timestamps, not observer delivery or a timer. */
export class VideoPlaybackDiagnostics {
  private readonly sources = new Map<string, Trace>();
  private readonly cycles = new Map<string, Cycle>();
  private owner = "";
  constructor(private readonly log: (label: string, detail: Record<string, unknown>) => void) {}
  consume(name: string, detail: Trace, at: number): void {
    if (name === "Melt frame: video-cursor") {
      if (detail.playing)
        this.log(`[Melt video] Decoder cursor ${detail.action}`, { ...detail, wallMs: round(at) });
      return;
    }
    if (name === "Melt frame: video") {
      if (!detail.compositionId || !detail.layerId || seconds(detail.time) === null) return;
      this.sources.set(`${detail.compositionId}:${detail.layerId}:${seconds(detail.time)}`, detail);
      if (this.sources.size > 64) this.sources.delete(this.sources.keys().next().value!);
      return;
    }
    if (name !== "Melt frame: display" && name !== "Melt frame: preview-submit") return;
    const owner = `${detail.projectId}:${detail.compositionId}`;
    if (this.owner !== owner || !detail.playing) {
      this.cycles.clear();
      this.owner = owner;
    }
    const seen = new Set<string>();
    for (const [key, source] of this.sources) {
      if (
        source.compositionId !== detail.compositionId ||
        seconds(source.time) !== seconds(detail.time)
      )
        continue;
      this.sources.delete(key);
      if (!detail.playing) continue;
      const requested = seconds(source.sourceTime),
        decoded = seconds(source.pts),
        duration = seconds(source.sourceDuration);
      if (requested === null || decoded === null || duration === null || duration <= 0) continue;
      const identity = `${source.assetId}:${requested}`;
      if (seen.has(identity)) continue;
      seen.add(identity);
      this.present(`${owner}:${source.layerId}`, { source, at, requested, decoded, duration });
    }
  }
  private present(key: string, sample: Sample): void {
    const previous = this.cycles.get(key);
    const info = {
      name: sample.source.sourceName,
      layerId: sample.source.layerId,
      durationSeconds: sample.duration,
      sourceSeconds: round(sample.requested),
      decodedSeconds: round(sample.decoded),
      proxy: sample.source.proxy,
    };
    if (!previous) {
      this.log("[Melt video] Playback started", info);
      this.cycles.set(key, {
        last: sample,
        began: sample.at,
        checkpoint: sample.at,
        requested: 0,
        decoded: 0,
        frames: 1,
      });
      if (this.cycles.size > 32) this.cycles.delete(this.cycles.keys().next().value!);
      return;
    }
    const backwards = sample.requested < previous.last.requested - 0.001;
    const loop =
      backwards && previous.last.requested >= sample.duration - 0.5 && sample.requested < 0.5;
    const correction = loop ? sample.duration : 0;
    previous.requested += sample.requested - previous.last.requested + correction;
    previous.decoded += sample.decoded - previous.last.decoded + correction;
    previous.frames++;
    const wall = (sample.at - previous.checkpoint) / 1000;
    if (backwards || wall >= 2) {
      this.log(
        backwards
          ? `[Melt video] ${loop ? "Source loop" : "Backward seek / reverse"}`
          : "[Melt video] Presented speed",
        {
          ...info,
          wallSeconds: round(wall),
          cycleWallSeconds: round((sample.at - previous.began) / 1000),
          sourceAdvanceSeconds: round(previous.requested),
          decodedAdvanceSeconds: round(previous.decoded),
          decodedSpeed: !backwards || loop ? round(previous.decoded / Math.max(wall, 0.001)) : null,
          previousSourceSeconds: round(previous.last.requested),
          frames: previous.frames,
        },
      );
      previous.checkpoint = sample.at;
      previous.requested = previous.decoded = 0;
      if (backwards) {
        previous.began = sample.at;
        previous.frames = 0;
      }
    }
    previous.last = sample;
  }
}

if (
  import.meta.env.DEV &&
  typeof window !== "undefined" &&
  typeof PerformanceObserver !== "undefined"
) {
  const diagnostics = new VideoPlaybackDiagnostics((label, detail) => {
    const speed =
      typeof detail.decodedSpeed === "number"
        ? ` — ${detail.decodedSpeed}× (${String(detail.decodedAdvanceSeconds)}s decoded / ${String(detail.wallSeconds)}s real)`
        : "";
    const loop = label.endsWith("Source loop")
      ? ` — ${String(detail.cycleWallSeconds)}s real, ${String(detail.durationSeconds)}s source`
      : "";
    const reason = typeof detail.reason === "string" ? ` — ${detail.reason}` : "";
    console.info(`${label}${speed}${loop}${reason}`, detail);
  });
  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries())
      if (entry.entryType === "mark" && "detail" in entry && entry.name.startsWith("Melt frame:"))
        diagnostics.consume(entry.name, entry.detail as Trace, entry.startTime);
  });
  observer.observe({ type: "mark" });
  import.meta.hot?.dispose(() => observer.disconnect());
}
