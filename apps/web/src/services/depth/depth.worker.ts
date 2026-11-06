import { videoPoster } from "../selection/video/poster";
import type { ModelDownloadEvent } from "../selection/model/contract";
import type { VideoAsset } from "@musart/core";
import type { DepthResponse } from "./client";
import { createDepthModel } from "./inference";
import { prepareDepth } from "./process";
const send = (value: DepthResponse) => globalThis.postMessage(value);
let busy = false;
let preparedModel: Awaited<ReturnType<typeof createDepthModel>> | undefined;
let continueFrame: (() => void) | undefined;
const yieldFrame = () =>
  new Promise<void>((resolve) => {
    continueFrame = resolve;
    send({ yield: true });
  });
globalThis.onmessage = async (
  event: MessageEvent<{
    type: "prepare" | "generate" | "continue" | "poster";
    original: Blob;
    video?: VideoAsset;
  }>,
) => {
  if (event.data.type === "continue") {
    const resume = continueFrame;
    continueFrame = undefined;
    resume?.();
    return;
  }
  if (busy) {
    send({ error: "Depth worker is busy." });
    return;
  }
  busy = true;
  let notified = -Infinity;
  const progress = (value: ModelDownloadEvent) => {
    if (value.status !== "progress" || performance.now() - notified > 100) {
      notified = performance.now();
      send({ progress: value });
    }
  };
  try {
    if (event.data.type === "poster") {
      if (!event.data.video) throw Error("Video preview requires a video source.");
      send({ result: await videoPoster(event.data.original, event.data.video, 0.5) });
    } else if (event.data.type === "prepare") {
      const previous = preparedModel;
      preparedModel = undefined;
      await previous?.dispose();
      preparedModel = await createDepthModel(progress, yieldFrame);
      send({ ready: true });
    } else {
      const model = preparedModel;
      preparedModel = undefined;
      const result = await prepareDepth(
        event.data.original,
        event.data.video,
        progress,
        (fraction) => {
          if (performance.now() - notified > 100 || fraction === 1) {
            notified = performance.now();
            send({ fraction });
          }
        },
        yieldFrame,
        model,
      );
      send({ result });
    }
  } catch (error) {
    send({ error: error instanceof Error ? error.message : String(error) });
  } finally {
    busy = false;
  }
};
