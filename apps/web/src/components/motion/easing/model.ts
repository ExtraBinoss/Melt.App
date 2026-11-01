import {
  animationPropertyId,
  projectMotionProperties,
  projectAnimationProperties,
  compareMotionTime,
  compileMotionEasing,
  createMotionEasingPreset,
  EngineError,
  isMotionEasing,
  MOTION_EASING_PRESETS,
  type EnginePort,
  type MotionEasing,
  type MotionEasingPreset,
  type MotionKeyframe,
  type MotionPropertyTrack,
  type SceneMotionPropertyTrack,
} from "@musart/core";
import { sceneTimelineProperties } from "../scene/properties";

export function sameEasing(left: MotionEasing | undefined, right: MotionEasing): boolean {
  const a = left ?? { type: "linear" };
  if (a.type !== right.type) return false;
  if (a.type === "linear" || a.type === "hold") return true;
  if (a.type === "spring" && right.type === "spring")
    return a.bounce === right.bounce && (a.response ?? 12) === (right.response ?? 12);
  return (
    a.type === "cubicBezier" &&
    right.type === "cubicBezier" &&
    a.x1 === right.x1 &&
    a.y1 === right.y1 &&
    a.x2 === right.x2 &&
    a.y2 === right.y2
  );
}

export function identifyEasing(
  easing: MotionEasing,
): MotionEasingPreset | "customBezier" | "customSpring" {
  return (
    MOTION_EASING_PRESETS.find((preset) => sameEasing(easing, createMotionEasingPreset(preset))) ??
    (easing.type === "spring" ? "customSpring" : "customBezier")
  );
}

export function easingGraph(easing: MotionEasing, steps = 80) {
  const sample = compileMotionEasing(easing);
  const points = Array.from({ length: steps + 1 }, (_, index) => ({
    x: index / steps,
    y: sample(index / steps),
  }));
  const bounds = [
    ...points.map((point) => point.y),
    ...(easing.type === "cubicBezier" ? [easing.y1, easing.y2] : []),
  ];
  const extent = Math.max(1, ...bounds.map(Math.abs));
  const low = Math.min(0, ...bounds.map((value) => value / extent));
  const high = Math.max(1 / extent, ...bounds.map((value) => value / extent));
  const range = high - low;
  const toY = (value: number) => 116 - ((value / extent - low) / range) * 92;
  const path = points
    .map(
      (point, index) =>
        `${index ? "L" : "M"}${(20 + point.x * 204).toFixed(3)},${toY(point.y).toFixed(3)}`,
    )
    .join(" ");
  return {
    points,
    path,
    toY,
    fromY: (pixel: number) => (low + ((116 - pixel) / 92) * range) * extent,
  };
}

export interface EasingOrigin {
  projectId: string;
  pageId: string;
  revision: number;
  trackId?: string;
  property: MotionPropertyTrack | SceneMotionPropertyTrack;
  key: MotionKeyframe;
}

export function captureEasingOrigin(
  engine: EnginePort,
  pageId: string,
  propertyId: string,
  keyId: string,
): EasingOrigin {
  const snapshot = engine.getSnapshot();
  const page = snapshot.project.pages.find((item) => item.id === pageId);
  const track = page?.motion?.tracks.find((track) =>
    projectMotionProperties(track).some((property) => property.id === propertyId),
  );
  const property =
    (track && projectMotionProperties(track).find((item) => item.id === propertyId)) ??
    (page && sceneTimelineProperties(page).find((item) => item.id === propertyId));
  const key = property?.keyframes.find((item) => item.id === keyId);
  if (snapshot.pageId !== pageId || page?.motion?.mode !== "motion" || !property || !key)
    throw new EngineError("INVALID_COMMAND", "Easing target is unavailable.");
  return {
    projectId: snapshot.project.id,
    pageId,
    revision: snapshot.revision,
    trackId: track?.id,
    property,
    key,
  };
}

/** The destination key keeps its identity, authored time and value. */
export function commitEasing(
  engine: EnginePort,
  origin: EasingOrigin,
  easing: MotionEasing,
): "unchanged" | "committed" {
  if (!isMotionEasing(easing)) throw new EngineError("INVALID_COMMAND", "Invalid easing curve.");
  const current = captureEasingOrigin(engine, origin.pageId, origin.property.id, origin.key.id);
  if (
    current.projectId !== origin.projectId ||
    current.revision !== origin.revision ||
    current.trackId !== origin.trackId ||
    compareMotionTime(current.key.time, origin.key.time) !== 0
  )
    throw new EngineError("INVALID_COMMAND", "Easing target changed.");
  if (sameEasing(origin.key.easing, easing)) return "unchanged";
  const page = engine.getSnapshot().project.pages.find((page) => page.id === origin.pageId)!;
  const track = page.motion!.tracks.find((track) => track.id === origin.trackId)!;
  const source =
    track &&
    projectAnimationProperties(track).find((entry) => entry.property.id === origin.property.id);
  if (source) {
    const preset = structuredClone(source.animation.preset);
    const index = source.property.keyframes.findIndex((key) => key.id === origin.key.id);
    preset.channels[source.channelIndex]!.points[index]!.easing = { ...easing };
    engine.transaction([
      { type: "updateMotionAnimation", animationId: source.animation.id, patch: { preset } },
    ]);
    return "committed";
  }
  if (!track) {
    const animation = page.motion?.sceneAnimations?.find((animation) =>
      animation.preset.channels.some(
        (_, index) => animationPropertyId(animation.id, index) === origin.property.id,
      ),
    );
    if (animation) {
      const preset = structuredClone(animation.preset);
      const channel = preset.channels.findIndex(
        (_, index) => animationPropertyId(animation.id, index) === origin.property.id,
      );
      const point = origin.property.keyframes.findIndex((key) => key.id === origin.key.id);
      preset.channels[channel]!.points[point]!.easing = { ...easing };
      engine.transaction([
        { type: "updateMotionAnimation", animationId: animation.id, patch: { preset } },
      ]);
      return "committed";
    }
  }
  const { target } = origin.property;
  const fields = { time: origin.key.time, value: origin.key.value, easing };
  if (target.kind === "camera" || target.kind === "environment" || target.kind === "light")
    engine.transaction([{ type: "upsertMotionKeyframe", target, ...fields }]);
  else
    engine.transaction([
      { type: "upsertMotionKeyframe", trackId: origin.trackId!, target, ...fields },
    ]);
  return "committed";
}
