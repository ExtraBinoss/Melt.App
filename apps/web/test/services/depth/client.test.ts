import { expect, it, vi } from "vitest";
import { DepthClient, type DepthResponse } from "../../../src/services/depth/client";
it("keeps an active gesture paused across model preparation and frame generation, then disposes the permit", async () => {
  vi.useFakeTimers();
  const instances: FakeWorker[] = [];
  class FakeWorker {
    onmessage: ((event: MessageEvent<DepthResponse>) => void) | null = null;
    onerror = null;
    messages: string[] = [];
    constructor() {
      instances.push(this);
    }
    emit(data: DepthResponse) {
      this.onmessage?.({ data } as MessageEvent<DepthResponse>);
    }
    postMessage(message: { type: string }) {
      this.messages.push(message.type);
      if (message.type === "prepare") queueMicrotask(() => this.emit({ ready: true }));
      if (message.type === "generate") queueMicrotask(() => this.emit({ yield: true }));
      if (message.type === "continue")
        this.emit({ result: { blob: new Blob(["depth"]), width: 1, height: 1 } });
    }
    terminate = vi.fn();
  }
  vi.stubGlobal("Worker", FakeWorker);
  const client = new DepthClient();
  try {
    await client.model.prepare();
    document.dispatchEvent(new MouseEvent("pointerdown"));
    const job = client.generate(new Blob(["source"]), undefined, () => {});
    await Promise.resolve();
    vi.advanceTimersByTime(500);
    expect(instances[0]!.messages).toEqual(["prepare", "generate"]);
    document.dispatchEvent(new MouseEvent("pointerup"));
    vi.advanceTimersByTime(200);
    await expect(job).resolves.toMatchObject({ width: 1, height: 1 });
    expect(instances[0]!.messages).toEqual(["prepare", "generate", "continue"]);
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    client.dispose();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  }
});
