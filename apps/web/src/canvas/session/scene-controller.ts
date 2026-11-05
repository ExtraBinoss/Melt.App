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
import { layerDragController } from "../../components/layers/drag/controller";
import { CanonicalFrameLineage } from "./canonical-lineage";
import type { CommandCommitInfo } from "@musart/core";
import type { CanonicalContinuation } from "../render/frame-request";

interface SummaryEngine extends EnginePort {
  subscribeCommitInfo(listener: (event: CommandCommitInfo) => void): () => void;
}

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
    (before.sceneValues?.length ?? 0) === (after.sceneValues?.length ?? 0) &&
    (before.sceneValues ?? []).every((value, index) => {
      const next = after.sceneValues![index]!;
      return value.target === next.target && Object.is(value.value, next.value);
    }) &&
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
  private stopCommitInfo: (() => void) | null = null;
  private readonly canonicalLineage: CanonicalFrameLineage;
  private cachedContinuation: CanonicalContinuation | undefined;
  private cachedBaseContinuation: CanonicalContinuation | undefined;
  private observedProject: Project;
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
  private readonly layerDrag: ReturnType<typeof layerDragController>;
  private stopLayerDrag: (() => void) | null = null;
  private cachedLayerOrder: Layer[] | null = null;
  private patches: LayerPatch[] = [];
  private gestureOwner: object | null = null;
  private transformPreview: object | undefined;
  private gestureOrigin: { project: Project; pageId: string; selection: readonly string[] } | null =
    null;
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
    this.layerDrag = layerDragController(engine);
    const snapshot = engine.getSnapshot();
    this.observedProject = snapshot.project;
    this.canonicalLineage = new CanonicalFrameLineage(snapshot);
  }
  holdPlayback = () => this.motion.holdPlayback(PLAYBACK_FRAME_CREDIT_MS);

  read = (): SceneFrame => {
    const playback = this.playback.read();
    if (playback) {
      this.canonicalLineage.read(this.engine.getSnapshot(), false);
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
    if (
      this.gestureOrigin &&
      (this.gestureOrigin.project !== snapshot.project ||
        this.gestureOrigin.pageId !== snapshot.pageId ||
        this.gestureOrigin.selection !== snapshot.selection)
    ) {
      this.patches = [];
      this.gestureOwner = null;
      this.gestureOrigin = null;
      this.transformPreview = undefined;
      this.gestureRevision++;
    }
    const preview = this.preview.read();
    const motionFrame = this.motion.readFrame();
    const motionPlan = this.motion.readFramePlan();
    const motionPlaying = motionFrame !== null && this.motion.read().playing;
    const motionPreviewing = this.motion.isPreviewing();
    const page =
      snapshot.project.pages.find((item) => item.id === snapshot.pageId) ??
      snapshot.project.pages[0]!;
    const presented = motionFrame ?? page;
    const drag = this.layerDrag.read();
    const layerOrder =
      drag?.pageId === page.id && drag.base === page.layers ? drag.previewLayers : null;
    const paintPreview = this.paintPreview.read(
      snapshot.project,
      presented,
      snapshot.selection,
      !motionPlaying &&
        !motionPreviewing &&
        !layerOrder &&
        !this.patches.length &&
        !this.draft &&
        !this.flatSource
        ? preview
        : null,
    );
    const canonical =
      !motionPlaying &&
      !motionPreviewing &&
      !layerOrder &&
      !preview &&
      !this.patches.length &&
      !this.draft &&
      !this.flatSource;
    const continuation = this.canonicalLineage.read(
      snapshot,
      canonical && !motionPlan,
      paintPreview && !motionPlan ? preview : null,
    );
    const baseContinuation = this.canonicalLineage.baseContinuation;
    // Property/presence changes are already represented by the materialized page. Only
    // requested media additionally depends on the plan clock; a still needs no new GPU draw.
    const mediaTimeChanged =
      this.cachedMotionPlan !== motionPlan &&
      Boolean(this.cachedMotionPlan?.mediaRequests.length || motionPlan?.mediaRequests.length);
    if (
      this.cached &&
      this.cachedProject === snapshot.project &&
      this.cachedPageId === snapshot.pageId &&
      this.cachedPreview === preview &&
      this.cachedLayerOrder === layerOrder &&
      this.cachedPaintPreview === paintPreview &&
      this.cachedContinuation === continuation &&
      this.cachedBaseContinuation === baseContinuation &&
      !mediaTimeChanged &&
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
    const heldPreview =
      !preview &&
      !motionPlaying &&
      !motionPreviewing &&
      !layerOrder &&
      this.patches.length &&
      !this.draft &&
      !this.flatSource
        ? this.transformPreview
        : paintPreview;
    let next = applyPreview(
      preview?.target === "page" ? { ...presented, ...preview.patch } : presented,
      layerPatches,
    );
    if (layerOrder && layerOrder !== page.layers) {
      const evaluated = new Map(next.layers.map((layer) => [layer.id, layer]));
      const canonical = new Map(page.layers.map((layer) => [layer.id, layer]));
      next = {
        ...next,
        layers: layerOrder.map((layer) => {
          const pose = evaluated.get(layer.id)!;
          const original = canonical.get(layer.id)!;
          // Same-parent reorder retains evaluated Motion/property values. Hierarchy
          // edits use the validated world-preserving transforms from the projection.
          return layer.parentId !== original.parentId ||
            layer.spatial?.basis !== original.spatial?.basis
            ? {
                ...pose,
                parentId: layer.parentId,
                x: layer.x,
                y: layer.y,
                rotation: layer.rotation,
                affine: layer.affine,
                spatial: layer.spatial,
              }
            : pose;
        }),
      };
    }
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
    this.cachedLayerOrder = layerOrder;
    this.cachedPaintPreview = paintPreview;
    this.cachedContinuation = continuation;
    this.cachedBaseContinuation = baseContinuation;
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
        ...(heldPreview ? { preview: heldPreview } : {}),
        ...(continuation ? { continuation } : {}),
        ...(baseContinuation ? { baseContinuation } : {}),
        // A paused evaluated frame acknowledges the committed revision just like a still.
        // Playback/gesture drafts must not admit background journal/thumbnail GPU work.
        canonical,
      },
    };
    return this.cached;
  };
  private change = () => {
    // Motion and other engine observers may notify before our state listener.
    if (this.stopCommitInfo && this.engine.getSnapshot().project !== this.observedProject) return;
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
      const summarized =
        "subscribeCommitInfo" in this.engine &&
        typeof this.engine.subscribeCommitInfo === "function";
      this.observedProject = this.engine.getSnapshot().project;
      if (summarized)
        this.stopCommitInfo = (this.engine as SummaryEngine).subscribeCommitInfo((event) => {
          this.canonicalLineage.accept(event);
          this.observedProject = event.snapshot.project;
          const current = this.engine.getSnapshot();
          if (
            current.project === event.snapshot.project &&
            current.revision === event.snapshot.revision
          )
            this.change();
        });
      this.stopEngine = this.engine.subscribe(() => {
        // Commit summaries are synchronous, after state listeners. Publish their
        // project mutation once it is certified; selection/navigation stays immediate.
        if (!summarized || this.engine.getSnapshot().project === this.observedProject)
          this.change();
      });
      this.stopPreview = this.preview.subscribe(this.change);
      this.stopLayerDrag = this.layerDrag.subscribe(this.change);
      this.stopPlayback = this.playback.subscribe(this.change);
    }
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) {
        this.stopEngine?.();
        this.stopCommitInfo?.();
        this.stopPreview?.();
        this.stopLayerDrag?.();
        this.stopPlayback?.();
        this.stopMotion?.();
        this.stopEngine = null;
        this.stopCommitInfo = null;
        this.stopPreview = null;
        this.stopLayerDrag = null;
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
    if (patches.length && (!this.patches.length || this.gestureOwner !== owner)) {
      const snapshot = this.engine.getSnapshot();
      this.transformPreview = {};
      this.gestureOrigin = {
        project: snapshot.project,
        pageId: snapshot.pageId,
        selection: snapshot.selection,
      };
    } else if (!patches.length) {
      this.transformPreview = undefined;
      this.gestureOrigin = null;
    }
    this.gestureOwner = owner;
    if (patches.length === 0 && this.patches.length === 0 && draft === this.draft) return;
    this.patches = patches;
    this.draft = draft;
    this.gestureRevision++;
    this.change();
  }
}
