import type { Request, Result } from "./worker";
export function projectArchive(request: Request): Promise<Result> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    const cleanup = () => {
      clearTimeout(timer);
      worker.terminate();
      worker.onmessage = null;
      worker.onerror = null;
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(Error("Project archive timed out."));
    }, 120000);
    worker.onmessage = (event: MessageEvent<{ result?: Result; error?: string }>) => {
      cleanup();
      if (event.data.result) resolve(event.data.result);
      else reject(Error(event.data.error ?? "Project archive failed."));
    };
    worker.onerror = (event) => {
      cleanup();
      reject(Error(event.message));
    };
    try {
      worker.postMessage(request);
    } catch (error) {
      cleanup();
      reject(error);
    }
  });
}
