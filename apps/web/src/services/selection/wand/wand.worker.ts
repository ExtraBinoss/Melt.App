import { encodeMask } from "../encode-mask";
import { createWandHost } from "./worker-host";
import type { WandRequest, WandResponse } from "./model";
const scope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<WandRequest>) => void) | null;
  postMessage(message: WandResponse, transfer: Transferable[]): void;
};
const process = createWandHost();
export function processWand(request: WandRequest): WandResponse | Promise<WandResponse> {
  const result = process(request);
  if (!("image" in result) || !result.image || !("data" in result.image)) return result;
  const image = result.image;
  return encodeMask(image)
    .then((encoded): WandResponse => ({
      id: result.id,
      image: { ...encoded, x: image.x, y: image.y },
    }))
    .catch((error: unknown): WandResponse => ({
      id: request.id,
      error: error instanceof Error ? error.message : String(error),
    }));
}
function post(result: WandResponse) {
  scope.postMessage(result, "mask" in result ? [result.mask.data.buffer as ArrayBuffer] : []);
}
scope.onmessage = ({ data }) => {
  const result = processWand(data);
  if (result instanceof Promise) void result.then(post);
  else post(result);
};
