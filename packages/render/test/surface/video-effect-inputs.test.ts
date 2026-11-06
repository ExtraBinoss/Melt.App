import { expect, it } from "vitest";
import { createLayer, createEffect, type VideoAsset, type MotionFramePlan } from "@musart/core";
import { prepareVideoEffectInputs } from "../../src/surface/video-effect-inputs";
const video: VideoAsset = {
  kind: "video",
  id: "video",
  name: "Video",
  mime: "video/webm",
  originalId: "original",
  contentRevision: "one",
  byteLength: 3,
  width: 64,
  height: 32,
  duration: { value: 10, rate: 1 },
  firstTimestamp: { value: 7, rate: 1 },
  timeResolution: 1000,
  orientation: { rotation: 0, flip: false, pixelAspectRatio: { numerator: 1, denominator: 1 } },
};
const mask: VideoAsset = { ...video, id: "matte", firstTimestamp: { value: 0, rate: 1 } };
it("uses the owner source clock for prepared depth clips and leaves authored layers unchanged", () => {
  const layer = createLayer("video", {
    id: "subject",
    assetId: video.id,
    effects: [createEffect("depth-anything", { id: "depth-effect", inputs: { depth: mask.id } })],
  });
  const frame: MotionFramePlan = {
    compositionId: "page",
    mode: "motion",
    time: { value: 20, rate: 1 },
    terminalPreview: false,
    values: [],
    activeLayerIds: [layer.id],
    mediaRequests: [
      {
        layerId: layer.id,
        assetId: video.id,
        sourceTime: { value: 19, rate: 2 },
        volume: 0.8,
        mute: false,
      },
    ],
  };
  const prepared = prepareVideoEffectInputs(
    [layer],
    { video, matte: mask },
    { motionFrame: frame },
  );
  expect(prepared.layers).toHaveLength(2);
  expect(prepared.layers[0]).toBe(layer);
  expect(prepared.options.motionFrame!.mediaRequests[1]).toMatchObject({
    assetId: mask.id,
    sourceTime: { value: 5, rate: 2 },
    mute: true,
    volume: 0,
  });
  expect(frame.mediaRequests).toHaveLength(1);
  expect(
    prepareVideoEffectInputs(
      [{ ...layer, effects: [{ ...layer.effects[0]!, enabled: false }] }],
      { video, matte: mask },
      {},
    ).ids.size,
  ).toBe(0);
  expect(() =>
    prepareVideoEffectInputs([{ ...layer, kind: "image" }], { video, matte: mask }, {}),
  ).toThrow("video owner");
});
