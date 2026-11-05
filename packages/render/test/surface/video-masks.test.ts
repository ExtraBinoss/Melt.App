import { expect, it } from "vitest";
import { createLayer, type VideoAsset, type MotionFramePlan } from "@musart/core";
import { prepareVideoMasks } from "../../src/surface/video-masks";
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
it("binds masks to source-relative time and preserves the real video/audio requests without authoring layers or keyframes", () => {
  const layer = createLayer("video", {
    id: "subject",
    assetId: "video",
    x: 80,
    rotation: 25,
    mask: { assetId: "matte", enabled: true, inverted: false, mode: "luminance" },
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
  const prepared = prepareVideoMasks([layer], { video, matte: mask }, { motionFrame: frame });
  const id = prepared.ids.get(layer.id)!;
  expect(prepared.options.motionFrame!.mediaRequests).toEqual([
    frame.mediaRequests[0],
    { layerId: id, assetId: mask.id, sourceTime: { value: 5, rate: 2 }, mute: true, volume: 0 },
  ]);
  expect(prepared.layers).toHaveLength(2);
  expect(prepared.layers[0]).toBe(layer);
  expect(frame.mediaRequests).toHaveLength(1);
  expect(prepared.layers[1]).toMatchObject({
    id,
    kind: "video",
    assetId: mask.id,
    mask: null,
    opacity: 1,
  });
  expect(
    prepareVideoMasks(
      [{ ...layer, mask: { ...layer.mask!, enabled: false } }],
      { video, matte: mask },
      {},
    ).ids.size,
  ).toBe(0);
});
it("rejects ambiguous untimed owners and conflicting internal identities", () => {
  const layer = createLayer("image", {
    id: "subject",
    assetId: "video",
    mask: { assetId: "matte", enabled: true, inverted: false },
  });
  expect(() => prepareVideoMasks([layer], { video, matte: mask }, {})).toThrow("video owner");
  const owner = { ...layer, kind: "video" as const };
  expect(() =>
    prepareVideoMasks(
      [owner, createLayer("rectangle", { id: JSON.stringify(["video-mask", "subject"]) })],
      { video, matte: mask },
      {},
    ),
  ).toThrow("identity collision");
});
