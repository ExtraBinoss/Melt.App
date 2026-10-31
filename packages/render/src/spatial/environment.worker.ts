/// <reference lib="webworker" />
import { decodeEnvironmentPixels } from "./environment-decode";
self.onmessage = (event: MessageEvent<{ buffer: ArrayBuffer; mime: string }>) => {
  void decodeEnvironmentPixels(event.data.buffer, event.data.mime).then(
    (value) => self.postMessage({ value }, { transfer: [value.data] }),
    (error: unknown) =>
      self.postMessage({
        error: error instanceof Error ? error.message : "Environment preparation failed",
      }),
  );
};
