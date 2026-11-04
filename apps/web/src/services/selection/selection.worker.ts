import { floodMask } from "./pixel-selection";
import type { SelectionRequest, SelectionResponse } from "./selection";
import type { ModelDownloadEvent } from "./model/contract";
import { modelProgressSink } from "./model/progress";
import { encodeMask } from "./encode-mask";
export async function processSelection(
  request: SelectionRequest,
  onProgress?: (event: ModelDownloadEvent) => void,
): Promise<SelectionResponse> {
  try {
    if (request.type === "wand")
      return {
        id: request.id,
        result: {
          data: floodMask(
            request.pixels,
            request.width,
            request.height,
            request.x,
            request.y,
            request.tolerance,
          ),
          width: request.width,
          height: request.height,
        },
      };
    const { prepareSam, segmentObject, releaseSam } = await import("./sam");
    const { prepareBackground, removeBackground, releaseBackground } =
      await import("./websam/background");
    if (request.type === "background" || (request.type === "prepare" && request.background)) {
      await releaseSam();
      if (request.type === "prepare") {
        await prepareBackground(onProgress);
        return { id: request.id, result: null };
      }
      const mask = await removeBackground(request.dataUrl, onProgress);
      return { id: request.id, result: request.encode ? await encodeMask(mask, true) : mask };
    }
    await releaseBackground();
    if (request.type === "prepare") {
      await prepareSam(onProgress);
      return { id: request.id, result: null };
    }
    if (request.type === "prompt") {
      const { segmentPrompt } = await import("./sam");
      return {
        id: request.id,
        result: await segmentPrompt(request.dataUrl, request.prompt, onProgress),
      };
    }
    if (request.type === "scan") {
      const { scanObjects } = await import("./websam/scan");
      return { id: request.id, result: await scanObjects(request.dataUrl, onProgress) };
    }
    const mask = onProgress
      ? await segmentObject(request.dataUrl, request.x, request.y, onProgress)
      : await segmentObject(request.dataUrl, request.x, request.y);
    return {
      id: request.id,
      result: request.encode ? await encodeMask(mask) : mask,
    };
  } catch (error) {
    return { id: request.id, error: error instanceof Error ? error.message : String(error) };
  }
}
export async function handleSelection(event: MessageEvent<SelectionRequest>) {
  const sink = modelProgressSink((progress) =>
    globalThis.postMessage({ id: event.data.id, progress } satisfies SelectionResponse),
  );
  const response = await processSelection(event.data, sink.note);
  sink.flush();
  globalThis.postMessage(
    response,
    "result" in response && response.result && "data" in response.result
      ? [response.result.data.buffer as ArrayBuffer]
      : [],
  );
}
globalThis.onmessage = handleSelection;
