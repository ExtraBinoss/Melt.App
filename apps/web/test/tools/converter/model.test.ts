import { expect, test } from "vitest";
import { motionTimeToSeconds, type VideoAsset } from "@musart/core";
import { ToolDocument } from "../../../src/tools/converter/model";
import { acceptToolFile } from "../../../src/tools/converter/input";
import { findTool, TOOL_PAGES, sourceTool, TOOLS } from "../../../src/tools/catalog";
const image = () => ({
  file: new File(["pixels"], "photo.png", { type: "image/png" }),
  asset: {
    id: "image",
    name: "photo.png",
    mime: "image/png",
    width: 4000,
    height: 3000,
    dataUrl: "data:image/png;base64,AA==",
  },
  duration: 0,
  hasAudio: false,
});
test("every registered tool has a unique route and supported effect; previews do not mutate history and a commit is undoable once", () => {
  expect(new Set(TOOLS.map((tool) => tool.slug)).size).toBe(12);
  expect(new Set(TOOL_PAGES.map((tool) => tool.slug)).size).toBe(6);
  const generic = findTool("ascii-converter")!;
  expect(sourceTool(generic, { type: "video/webm" }).media).toBe("video");
  expect(sourceTool(generic, { type: "image/png" }).media).toBe("image");
  for (const style of ["ascii", "dither", "halftone", "cyanotype", "crt", "posterize"]) {
    const tool = findTool(`${style}-image-converter`)!;
    const doc = new ToolDocument(image(), tool);
    expect(doc.effect().type).toBe(tool.effect);
    expect([doc.page().width, doc.page().height]).toEqual([1280, 960]);
  }
  const doc = new ToolDocument(image(), findTool("ascii-image-converter")!);
  const before = doc.engine.getSnapshot();
  expect(doc.draft({ scale: 24 }).scale).toBe(24);
  expect(doc.engine.getSnapshot()).toBe(before);
  expect(() => doc.draft({ scale: 0 })).toThrow();
  doc.commit({ scale: 24 });
  expect(doc.effect().scale).toBe(24);
  doc.engine.undo();
  expect(doc.effect().scale).toBe(10);
  expect(doc.engine.getSnapshot().canUndo).toBe(false);
  doc.resize(1920);
  expect([doc.page().width, doc.page().height, doc.page().layers[0]!.width]).toEqual([
    1920, 1440, 1920,
  ]);
  expect(() => doc.resize(4096)).toThrow();
});
test("short videos retain exact rational duration and trims/source audio remain validated and atomic", () => {
  const asset: VideoAsset = {
    id: "video",
    name: "clip.mp4",
    kind: "video",
    mime: "video/mp4",
    originalId: "original",
    contentRevision: "revision",
    byteLength: 5,
    width: 320,
    height: 240,
    duration: { value: 101, rate: 30 },
    firstTimestamp: { value: 0, rate: 1 },
    timeResolution: 30,
    orientation: { rotation: 0, flip: false, pixelAspectRatio: { numerator: 1, denominator: 1 } },
  };
  const doc = new ToolDocument(
    {
      file: new File(["video"], "clip.mp4", { type: "video/mp4" }),
      asset,
      duration: motionTimeToSeconds(asset.duration),
      hasAudio: true,
    },
    findTool("ascii-video-converter")!,
  );
  expect(doc.page().motion!.duration).toEqual(asset.duration);
  doc.clip(1, 2);
  expect(doc.page().motion!.duration).toEqual({ value: 2, rate: 1 });
  expect(doc.page().motion!.tracks[0]!.media!.sourceIn).toEqual({ value: 1, rate: 1 });
  const before = doc.engine.getSnapshot();
  expect(() => doc.clip(2, 2)).toThrow();
  expect(doc.engine.getSnapshot()).toBe(before);
  doc.audio(false);
  expect(doc.page().motion!.tracks[0]!.media!.mute).toBe(true);
  doc.clip(0, motionTimeToSeconds(asset.duration));
  expect(doc.page().motion!.duration).toEqual(asset.duration);
});
test("unsupported and oversized uploads fail before renderer loading, including bounded SVG parsing", () => {
  const tool = findTool("ascii-image-converter")!;
  expect(() =>
    acceptToolFile(new File(["nope"], "file.txt", { type: "text/plain" }), tool),
  ).toThrow("invalidFile");
  expect(() =>
    acceptToolFile(
      new File([new Uint8Array(256 * 1024 + 1)], "big.svg", { type: "image/svg+xml" }),
      tool,
    ),
  ).toThrow("fileTooLarge");
  expect(() => acceptToolFile(image().file, tool)).not.toThrow();
  expect(findTool("invented-image-converter")).toBeUndefined();
});

test("image and video dither share a validated source-color setting without committing drafts", () => {
  for (const media of ["image", "video"] as const) {
    const tool = findTool(`dither-${media}-converter`)!;
    expect(tool.basic).toContain("sourceColor");
    const source = image();
    const doc = new ToolDocument(
      media === "image"
        ? source
        : {
            ...source,
            file: new File(["video"], "clip.webm", { type: "video/webm" }),
            duration: 2,
            asset: {
              id: source.asset.id,
              name: "clip.webm",
              width: source.asset.width,
              height: source.asset.height,
              kind: "video",
              mime: "video/webm",
              originalId: "original",
              contentRevision: "revision",
              byteLength: 5,
              duration: { value: 2, rate: 1 },
              firstTimestamp: { value: 0, rate: 1 },
              timeResolution: 30,
              orientation: {
                rotation: 0,
                flip: false,
                pixelAspectRatio: { numerator: 1, denominator: 1 },
              },
            },
          },
      tool,
    );
    expect(doc.effect().settings!.sourceColor).toBe(false);
    const before = doc.engine.getSnapshot();
    const patch = { settings: { ...doc.effect().settings, sourceColor: true } };
    expect(doc.draft(patch).settings!.sourceColor).toBe(true);
    expect(doc.engine.getSnapshot()).toBe(before);
    doc.commit(patch);
    expect(doc.page().layers[0]!.effects[0]!.settings!.sourceColor).toBe(true);
    doc.engine.undo();
    expect(doc.effect().settings!.sourceColor).toBe(false);
    expect(doc.engine.getSnapshot().canUndo).toBe(false);
  }
});
