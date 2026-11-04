import type { StudioManifest } from "./integrity";
export function unpackInWorker(
  bytes: Uint8Array,
  manifest: StudioManifest,
  signal: AbortSignal,
): Promise<Record<string, Uint8Array>> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./unpack.worker.ts", import.meta.url), { type: "module" });
    function cleanup() {
      worker.terminate();
      signal.removeEventListener("abort", abort);
    }
    function abort() {
      cleanup();
      reject(new DOMException("Pack cancelled", "AbortError"));
    }
    signal.addEventListener("abort", abort, { once: true });
    worker.onerror = () => {
      cleanup();
      reject(Error("Pack worker failed"));
    };
    worker.onmessage = (
      event: MessageEvent<{ files?: Record<string, Uint8Array>; error?: string }>,
    ) => {
      cleanup();
      if (event.data.error || !event.data.files)
        reject(Error(event.data.error ?? "Missing pack files"));
      else resolve(event.data.files);
    };
    try {
      worker.postMessage({ bytes, manifest }, [bytes.buffer]);
    } catch (error) {
      cleanup();
      reject(error);
    }
  });
}
