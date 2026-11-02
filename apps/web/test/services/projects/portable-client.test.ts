import { afterEach, expect, it, vi } from "vitest";
import { createProject } from "@musart/core";
import { projectArchive } from "../../../src/services/projects/portable/client";
class WorkerMock {
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: ((event: { message: string }) => void) | null = null;
  postMessage = vi.fn();
  terminate = vi.fn();
}
function setup() {
  const worker = new WorkerMock();
  vi.stubGlobal(
    "Worker",
    class {
      constructor() {
        return worker;
      }
    },
  );
  return worker;
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
it("returns the real worker result and releases its handlers and timer", async () => {
  const worker = setup(),
    request = { kind: "encode" as const, project: createProject(), originals: [] };
  const pending = projectArchive(request),
    blob = new Blob(["zip"]);
  expect(worker.postMessage).toHaveBeenCalledWith(request);
  worker.onmessage!({ data: { result: { blob } } });
  expect(await pending).toEqual({ blob });
  expect(worker.terminate).toHaveBeenCalledOnce();
  expect(worker.onmessage).toBeNull();
  expect(worker.onerror).toBeNull();
});
it("rejects real archive and worker failures and disposes the worker", async () => {
  for (const kind of ["reply", "worker", "send"] as const) {
    const worker = setup();
    if (kind === "send")
      worker.postMessage.mockImplementation(() => {
        throw Error("send failed");
      });
    const pending = projectArchive({ kind: "decode", blob: new Blob() });
    const rejected = expect(pending).rejects.toThrow("failed");
    if (kind === "reply") worker.onmessage!({ data: { error: "archive failed" } });
    if (kind === "worker") worker.onerror!({ message: "worker failed" });
    await rejected;
    expect(worker.terminate).toHaveBeenCalledOnce();
  }
});
it("terminates a stalled worker with an explicit error", async () => {
  vi.useFakeTimers();
  const worker = setup(),
    pending = projectArchive({ kind: "decode", blob: new Blob() });
  const rejected = expect(pending).rejects.toThrow("timed out");
  await vi.advanceTimersByTimeAsync(120000);
  await rejected;
  expect(worker.terminate).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
});
