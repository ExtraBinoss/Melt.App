import {
  createEffect,
  createLayer,
  createPage,
  createProject,
  EditorEngine,
  getEffectDefinition,
  getEffectParameter,
  validateEffectParameter,
  normalizeMotionTime,
  compareMotionTime,
  subtractMotionTime,
  type Effect,
  type Project,
} from "@musart/core";
import type { ToolDefinition } from "../catalog";
import type { ToolSource } from "./types";
const seconds = (value: number) =>
  normalizeMotionTime({ value: Math.round(value * 1_000_000), rate: 1_000_000 });
export class ToolDocument {
  readonly engine: EditorEngine;
  readonly layerId = crypto.randomUUID();
  readonly trackId = crypto.randomUUID();
  edge = 1280;
  clipStart = 0;
  clipLength: number;
  keepAudio: boolean;
  constructor(
    readonly source: ToolSource,
    readonly tool: ToolDefinition,
  ) {
    this.clipLength = Math.min(60, source.duration);
    this.keepAudio = source.hasAudio;
    const { width, height } = this.size(this.edge);
    const effect = createEffect(tool.effect, {
      id: crypto.randomUUID(),
      ...(tool.initialSettings ? { settings: { ...tool.initialSettings } } : {}),
    });
    const layer = createLayer(tool.media === "video" ? "video" : "image", {
      id: this.layerId,
      name: source.file.name,
      assetId: source.asset.id,
      x: 0,
      y: 0,
      width,
      height,
      effects: [effect],
    });
    const span =
      source.asset.kind === "video" && source.duration <= 60
        ? source.asset.duration
        : seconds(this.clipLength);
    const page = createPage({
      id: crypto.randomUUID(),
      width,
      height,
      background: tool.media === "image" ? "#00000000" : "#000000",
      layers: [layer],
      ...(tool.media === "video"
        ? {
            motion: {
              version: 2 as const,
              initialized: true as const,
              mode: "motion" as const,
              duration: span,
              frameRate: { numerator: 30, denominator: 1 },
              tracks: [
                {
                  id: this.trackId,
                  layerId: this.layerId,
                  start: seconds(0),
                  end: span,
                  properties: [],
                  media: { sourceIn: seconds(0), mute: !this.keepAudio, volume: 1 },
                },
              ],
            },
          }
        : {}),
    });
    this.engine = new EditorEngine(
      createProject({
        id: crypto.randomUUID(),
        name: source.file.name,
        pages: [page],
        assets: { [source.asset.id]: source.asset },
      }),
    );
  }
  private size(edge: number) {
    const source = this.source.asset;
    if (source.kind === "audio") throw new Error("A visual source is required.");
    const ratio = Math.min(1, edge / Math.max(source.width, source.height));
    return {
      width: Math.max(1, Math.round(source.width * ratio)),
      height: Math.max(1, Math.round(source.height * ratio)),
    };
  }
  project(): Project {
    return this.engine.getSnapshot().project;
  }
  page() {
    return this.project().pages[0]!;
  }
  effect() {
    return this.page().layers[0]!.effects[0]!;
  }
  draft(patch: Partial<Effect>) {
    const effect = { ...this.effect(), ...patch };
    for (const parameter of getEffectDefinition(effect.type).parameters)
      validateEffectParameter(parameter, getEffectParameter(effect, parameter));
    return effect;
  }
  commit(patch: Partial<Effect>) {
    const effect = this.draft(patch);
    this.engine.execute({
      type: "updateLayers",
      ids: [this.layerId],
      patch: { effects: [effect] },
    });
  }
  resize(edge: number) {
    if (!Number.isInteger(edge) || edge < 64 || edge > 1920)
      throw new Error("Invalid output size.");
    const size = this.size(edge);
    this.engine.transaction([
      { type: "updatePage", patch: size },
      { type: "updateLayers", ids: [this.layerId], patch: size },
    ]);
    this.edge = edge;
  }
  clip(start: number, length: number) {
    if (
      this.tool.media !== "video" ||
      !Number.isFinite(start) ||
      !Number.isFinite(length) ||
      start < 0 ||
      length <= 0 ||
      length > 60 ||
      start + length > this.source.duration + 1e-6
    )
      throw new Error("Invalid clip range.");
    const asset = this.source.asset;
    if (asset.kind !== "video") throw new Error("A video source is required.");
    const sourceIn = seconds(start),
      remaining = subtractMotionTime(asset.duration, sourceIn);
    const requested = seconds(length),
      duration = compareMotionTime(requested, remaining) > 0 ? remaining : requested;
    this.engine.transaction([
      { type: "setMotionDuration", duration },
      { type: "setMotionTrackRange", trackId: this.trackId, start: seconds(0), end: duration },
      { type: "setMotionMedia", trackId: this.trackId, patch: { sourceIn } },
    ]);
    this.clipStart = start;
    this.clipLength = length;
  }
  audio(keep: boolean) {
    this.engine.execute({ type: "setMotionMedia", trackId: this.trackId, patch: { mute: !keep } });
    this.keepAudio = keep;
  }
}
