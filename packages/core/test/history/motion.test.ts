import { expect, it } from "vitest";
import {
  createEffect,
  createLayer,
  createSpatialLayer,
  createSpatialScene,
  SCENE_MOTION_ANIMATION_PRESETS,
  type MotionPropertyTarget,
  type SceneMotionPropertyTarget,
  type AudioAsset,
} from "../../src/index";
import { fixture, scalar, seconds } from "./support";
import { video } from "../assets/fixtures";

it("retains property identity and exact values for layer, material, effect and scene keys at independent times", () => {
  const d = fixture([
    createLayer("rectangle", {
      id: "item",
      spatial: createSpatialLayer(),
      effects: [createEffect("blur", { id: "blur" })],
    }),
  ]);
  const spatial = createSpatialScene();
  spatial.lights[0]!.id = "light";
  d.engine.execute({ type: "updatePage", patch: { spatial } });
  d.engine.execute({ type: "setCompositionMode", mode: "motion" });
  const targets: readonly [MotionPropertyTarget | SceneMotionPropertyTarget, number | string][] = [
    [{ kind: "layer", layerId: "item", property: "fill" }, "#ff0000"],
    [{ kind: "layer", layerId: "item", property: "opacity" }, 0.5],
    [{ kind: "layer", layerId: "item", property: "spatial.material.roughness" }, 0.23],
    [{ kind: "effect", layerId: "item", effectId: "blur", property: "amount" }, 0.4],
    [{ kind: "camera", compositionId: "page", property: "yaw" }, 90],
    [{ kind: "environment", compositionId: "page", property: "intensity" }, 2],
    [{ kind: "light", compositionId: "page", lightId: "light", property: "intensity" }, 5],
  ];
  d.engine.transaction(
    targets.map(([target, value]) => ({
      type: "upsertMotionKeyframe",
      target,
      time: seconds(1),
      value,
    })),
  );
  expect(d.properties()).toHaveLength(targets.length);
  expect(d.properties().every((change) => change.context === "keyframe" && change.at === 1)).toBe(
    true,
  );
  expect(d.properties().map((change) => change.target.property)).toEqual(
    targets.map(([target]) => target.property),
  );
  expect(d.properties().map((change) => change.after)).toEqual(
    targets.map(([, value]) => scalar(value)),
  );
  const description = d.description();
  d.engine.undo();
  expect(d.description()).toBe(description);
  d.engine.redo();
  expect(d.description()).toBe(description);
  const target = { kind: "layer", layerId: "item", property: "opacity" } as const;
  d.engine.transaction([
    { type: "upsertMotionKeyframe", target, time: seconds(1), value: 0.6 },
    { type: "upsertMotionKeyframe", target, time: seconds(2), value: 0.7 },
    { type: "upsertMotionKeyframe", target, time: seconds(1), value: 0.8 },
  ]);
  expect(d.properties()).toHaveLength(2);
  expect(d.properties()[0]).toMatchObject({ before: scalar(0.5), after: scalar(0.8), at: 1 });
  expect(d.properties()[1]).toMatchObject({ after: scalar(0.7), at: 2 });
});

it("describes key timing/easing and animation properties through their real owners", () => {
  const d = fixture();
  d.engine.execute({ type: "setCompositionMode", mode: "motion" });
  const target = { kind: "layer", layerId: "item", property: "x" } as const;
  d.engine.execute({ type: "upsertMotionKeyframe", target, time: seconds(1), value: 120 });
  const track = d.page().motion!.tracks[0]!,
    key = track.properties[0]!.keyframes[0]!;
  d.engine.execute({
    type: "upsertMotionKeyframe",
    target,
    time: seconds(1),
    value: 120,
    easing: { type: "spring", bounce: 0.2, response: 12 },
  });
  expect(d.properties().map((change) => change.target.property)).toEqual([
    "easing",
    "easing.bounce",
    "easing.response",
  ]);
  d.engine.execute({ type: "moveMotionKeyframe", keyframeId: key.id, time: seconds(2) });
  expect(d.properties()[0]).toMatchObject({
    target: { owner: { kind: "motion", keyframeId: key.id }, property: "time" },
    before: scalar(1),
    after: scalar(2),
  });
  d.engine.execute({ type: "deleteMotionKeyframe", keyframeId: key.id });
  expect(d.description().changes[0]).toMatchObject({
    kind: "action",
    action: "delete",
    owner: { entity: "keyframe", keyframeId: key.id },
  });
  const scenePreset = SCENE_MOTION_ANIMATION_PRESETS.find(
    (preset) => preset.id === "scene-camera-orbit",
  )!;
  d.engine.execute({
    type: "addMotionAnimation",
    owner: { kind: "camera", compositionId: "page" },
    preset: scenePreset,
    start: seconds(0),
  });
  const animation = d.page().motion!.sceneAnimations![0]!;
  d.engine.execute({
    type: "updateMotionAnimation",
    animationId: animation.id,
    patch: { strength: 0.5, enabled: false },
  });
  expect(d.properties().map((change) => change.target.property)).toEqual(["strength", "enabled"]);
});

it("retains setMotionMedia mute, volume and source in-point on the actual video occurrence", () => {
  const d = fixture([]),
    asset = video();
  d.engine.execute({
    type: "addLayers",
    assets: [asset],
    layers: [createLayer("video", { id: "clip", assetId: asset.id })],
  });
  d.engine.execute({ type: "setCompositionMode", mode: "motion" });
  const track = d.page().motion!.tracks[0]!;
  d.engine.execute({
    type: "setMotionTrackRange",
    trackId: track.id,
    start: seconds(0),
    end: seconds(3),
  });
  d.engine.execute({
    type: "setMotionMedia",
    trackId: track.id,
    patch: { mute: true, volume: 0.25, sourceIn: seconds(1) },
  });
  expect(d.properties().map((change) => change.target.property)).toEqual([
    "sourceIn",
    "mute",
    "volume",
  ]);
  expect(
    d
      .properties()
      .every(
        (change) =>
          change.target.owner.kind === "motion" && change.target.owner.trackId === track.id,
      ),
  ).toBe(true);
  expect(d.properties().find((change) => change.target.property === "mute")).toMatchObject({
    before: scalar(false),
    after: scalar(true),
  });
  expect(d.properties().find((change) => change.target.property === "volume")).toMatchObject({
    before: scalar(1),
    after: scalar(0.25),
  });
});

it("retains audio volume, mute, processing and trim values, and keeps undo/redo atomic", () => {
  const d = fixture([]);
  d.engine.execute({ type: "setCompositionMode", mode: "motion" });
  const asset: AudioAsset = {
    id: "sound",
    name: "Sound",
    kind: "audio",
    mime: "audio/wav",
    originalId: "original",
    contentRevision: "r1",
    byteLength: 100,
    duration: seconds(5),
    firstTimestamp: seconds(0),
    timeResolution: 48000,
    sampleRate: 48000,
    channels: 1,
  };
  d.engine.execute({
    type: "addMotionAudioTrack",
    asset,
    track: {
      id: "audio",
      assetId: "sound",
      name: "Sound",
      start: seconds(0),
      end: seconds(5),
      sourceIn: seconds(0),
      mute: false,
      volume: 1,
    },
  });
  d.engine.execute({
    type: "updateMotionAudioTrack",
    trackId: "audio",
    patch: {
      name: "Changed",
      volume: 0.25,
      mute: true,
      processing: { fadeIn: seconds(1), fadeOut: seconds(2), reverb: { mix: 0.5, decay: 2 } },
    },
  });
  expect(d.properties().map((change) => change.target.property)).toEqual([
    "name",
    "mute",
    "volume",
    "fadeIn",
    "fadeOut",
    "reverb.mix",
    "reverb.decay",
  ]);
  expect(d.properties().find((change) => change.target.property === "fadeIn")).toMatchObject({
    before: scalar(0),
    after: scalar(1),
  });
  const description = d.description();
  d.engine.undo();
  d.engine.redo();
  expect(d.description()).toBe(description);
  d.engine.execute({
    type: "setMotionAudioTrackRange",
    trackId: "audio",
    start: seconds(1),
    end: seconds(3),
  });
  expect(d.properties().map((change) => change.target.property)).toEqual([
    "start",
    "end",
    "sourceIn",
  ]);
  expect(d.properties().find((change) => change.target.property === "sourceIn")).toMatchObject({
    before: scalar(0),
    after: scalar(1),
  });
});
