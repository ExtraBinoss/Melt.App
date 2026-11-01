import { PLAYBACK_FRAME_CREDIT_MS } from "@musart/render/playback";
import type { MotionFramePlan, Asset, Composition, EnginePort, Layer, Project } from "@musart/core";
import type { PreviewSource, PreviewValue } from "../../state/session/preview-source";
import { createPlaybackSource, type PlaybackSource, type PlaybackFrame } from "./playback-source";
import { applyPreview, type LayerPatch } from "../interaction/gestures";
import { getCanonicalPresentation } from "../../state/session/canonical-presentation";
import { createMotionTransport, type MotionTransport } from "../../services/motion/transport";
import { getFontPresentation } from "../../state/session/font-presentation";
import type { PresentationInput } from "../render/frame-request";
import { PaintPreviewLineage } from "./preview-lineage";

export interface SceneFrame {
  page: Composition;
  assets: Record<string, Asset>;
  playback?: boolean;
  motionFrame?: MotionFramePlan;
  presentation?: PresentationInput;
}

/** Issued plans share compiled target identities. The transport owns the advancing UI clock. */
function sameMotionPose(before: MotionFramePlan | null, after: MotionFramePlan | null): boolean {
  if (before === after) return true;
  if (
    !before ||
    !after ||
    before.mode !== after.mode ||
    before.compositionId !== after.compositionId
  )
    return false;
  return (
    before.activeLayerIds.length === after.activeLayerIds.length &&
    before.values.length === after.values.length &&
    before.activeLayerIds.every((id, index) => id === after.activeLayerIds[index]) &&
    before.values.every((value, index) => {
      const next = after.values[index]!;
      return value.target === next.target && Object.is(value.value, next.value);
    })
  );
}
/** Stable imperative port shared by the GPU adapter and geometry overlays. */
export class SceneController {
  readonly presentation: ReturnType<typeof getCanonicalPresentation>;
  readonly fontPresentation: ReturnType<typeof getFontPresentation>;
  private readonly listeners = new Set<() => void>();
  private stopEngine: (() => void) | null = null;
  private stopPlayback: (() => void) | null = null;
  private readonly playback: PlaybackSource;
  private readonly motion: MotionTransport;
  private stopMotion: (() => void) | null = null;
  private cachedMotion: Composition | null = null;
  private cachedMotionPlan: MotionFramePlan | null = null;
  private cachedMotionPlaying = false;
  private cachedMotionPreviewing = false;
  private cachedPlayback: { source: PlaybackFrame; frame: SceneFrame } | null = null;
  private stopPreview: (() => void) | null = null;
  private patches: LayerPatch[] = [];
  private gestureOwner: object | null = null;
  private draft: Layer | null = null;
  private flatSource: string | null = null;
  private gestureRevision = 0;
  private cached: SceneFrame | null = null;
  private cachedProject: Project | null = null;
  private cachedPageId = "";
  private cachedPreview: PreviewValue | null = null;
  private cachedGesture = -1;
  private published: SceneFrame | null = null;
  private readonly paintPreview = new PaintPreviewLineage();
  private cachedPaintPreview: object | undefined;

  constructor(
    private readonly engine: EnginePort,
    private readonly preview: PreviewSource,
  ) {
    this.presentation = getCanonicalPresentation(engine);
    this.fontPresentation = getFontPresentation(engine);
    this.playback = createPlaybackSource(engine);
    this.motion = createMotionTransport(engine);
  }
  holdPlayback = () => this.motion.holdPlayback(PLAYBACK_FRAME_CREDIT_MS);

  read = (): SceneFrame => {
    const playback = this.playback.read();
    if (playback) {
      this.paintPreview.clear();
      this.motion.pause();
      if (this.cachedPlayback?.source !== playback) {
        const snapshot = this.engine.getSnapshot();
        this.cachedPlayback = {
          source: playback,
          frame: {
            ...playback,
            presentation: {
              origin: { projectId: snapshot.project.id, revision: snapshot.revision },
              canonical: false,
            },
          },
        };
      }
      return this.cachedPlayback.frame;
    }
    this.cachedPlayback = null;
    const snapshot = this.engine.getSnapshot();
    const preview = this.preview.read();
    const motionFrame = this.motion.readFrame();
    const motionPlan = this.motion.readFramePlan();
    const motionPlaying = motionFrame !== null && this.motion.read().playing;
    const motionPreviewing = this.motion.isPreviewing();
    const page =
      snapshot.project.pages.find((item) => item.id === snapshot.pageId) ??
      snapshot.project.pages[0]!;
    const presented = motionFrame ?? page;
    const paintPreview = this.paintPreview.read(
      snapshot.project,
      presented,
      snapshot.selection,
      !motionPlaying && !motionPreviewing && !this.patches.length && !this.draft && !this.flatSource
        ? preview
        : null,
    );
    // Property/presence changes are already represented by the materialized page. Only
    // requested media and clock-driven source effects also depend on the plan clock.
    const sourceTimeChanged =
      this.cachedMotionPlan !== motionPlan &&
      Boolean(
        this.cachedMotionPlan?.mediaRequests.length ||
        motionPlan?.mediaRequests.length ||
        this.cachedMotionPlan?.timeDependent ||
        motionPlan?.timeDependent,
      );
    if (
      this.cached &&
      this.cachedProject === snapshot.project &&
      this.cachedPageId === snapshot.pageId &&
      this.cachedPreview === preview &&
      this.cachedPaintPreview === paintPreview &&
      !sourceTimeChanged &&
      (this.cachedMotion === motionFrame || sameMotionPose(this.cachedMotionPlan, motionPlan)) &&
      this.cachedMotionPlaying === motionPlaying &&
      this.cachedMotionPreviewing === motionPreviewing &&
      this.cachedGesture === this.gestureRevision
    )
      return this.cached;
    const layerPatches =
      preview?.target === "layer"
        ? [...this.patches, preview]
        : preview?.target === "layers"
          ? [
              ...this.patches,
              ...preview.layerIds.map((layerId) => ({ layerId, patch: preview.patch })),
            ]
          : this.patches;
    let next = applyPreview(
      preview?.target === "page" ? { ...presented, ...preview.patch } : presented,
      layerPatches,
    );
    if (this.flatSource)
      next = {
        ...next,
        layers: next.layers.map((layer) =>
          layer.id === this.flatSource && layer.spatial?.enabled
            ? { ...layer, spatial: { ...layer.spatial, enabled: false } }
            : layer,
        ),
      };
    this.cachedProject = snapshot.project;
    this.cachedPageId = snapshot.pageId;
    this.cachedPreview = preview;
    this.cachedPaintPreview = paintPreview;
    this.cachedMotion = motionFrame;
    this.cachedMotionPlan = motionPlan;
    this.cachedMotionPlaying = motionPlaying;
    this.cachedMotionPreviewing = motionPreviewing;
    this.cachedGesture = this.gestureRevision;
    this.cached = {
      page: this.draft ? { ...next, layers: [...next.layers, this.draft] } : next,
      assets: snapshot.project.assets,
      ...(motionPlan ? { motionFrame: motionPlan } : {}),
      ...(motionPlaying ? { playback: true } : {}),
      presentation: {
        origin: { projectId: snapshot.project.id, revision: snapshot.revision },
        ...(paintPreview ? { preview: paintPreview } : {}),
        // A paused evaluated frame acknowledges the committed revision just like a still.
        // Playback/gesture drafts must not admit background journal/thumbnail GPU work.
        canonical:
          !motionPlaying &&
          !motionPreviewing &&
          !preview &&
          !this.patches.length &&
          !this.draft &&
          !this.flatSource,
      },
    };
    return this.cached;
  };
  private change = () => {
    const next = this.read();
    if (next === this.published) return;
    this.published = next;
    for (const listener of this.listeners) listener();
  };
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    if (this.listeners.size === 1) {
      this.published = this.read();
      this.stopMotion = this.motion.subscribe(this.change);
      this.stopEngine = this.engine.subscribe(this.change);
      this.stopPreview = this.preview.subscribe(this.change);
      this.stopPlayback = this.playback.subscribe(this.change);
    }
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) {
        this.stopEngine?.();
        this.stopPreview?.();
        this.stopPlayback?.();
        this.stopMotion?.();
        this.stopEngine = null;
        this.stopPreview = null;
        this.stopPlayback = null;
        this.stopMotion = null;
      }
    };
  };
  setFlatSource(layerId: string | null): void {
    if (this.flatSource === layerId) return;
    this.flatSource = layerId;
    this.gestureRevision++;
    this.change();
  }
  clearGesture(owner: object): void {
    if (this.gestureOwner === owner) this.setGesture([]);
  }
  setGesture(patches: LayerPatch[], draft: Layer | null = null, owner: object | null = null): void {
    this.gestureOwner = owner;
    if (patches.length === 0 && this.patches.length === 0 && draft === this.draft) return;
    this.patches = patches;
    this.draft = draft;
    this.gestureRevision++;
    this.change();
  }
}
