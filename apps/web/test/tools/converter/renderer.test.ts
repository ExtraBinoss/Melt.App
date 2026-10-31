import { afterEach, expect, test, vi } from "vitest";
import type { Composition } from "@musart/core";
import { findTool } from "../../../src/tools/catalog";
import { ToolDocument } from "../../../src/tools/converter/model";
import { ToolRenderer } from "../../../src/tools/converter/renderer";
import type { ToolRenderApi } from "../../../src/tools/converter/types";

afterEach(() => vi.unstubAllGlobals());
test("live drafts coalesce without freezing playback; commit/cancel reject pending drafts and disposal fences callbacks", async () => {
  const frames = new Map<number, FrameRequestCallback>();
  let sequence = 0,
    now = 0;
  vi.spyOn(performance, "now").mockImplementation(() => now);
  vi.stubGlobal("requestAnimationFrame", (fn: FrameRequestCallback) => {
    frames.set(++sequence, fn);
    return sequence;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  const canvas = document.createElement("canvas"),
    host = document.createElement("div");
  const calls: {
    page: Composition;
    options: { mediaMode: string; canRender(): boolean };
    finish(): void;
  }[] = [];
  const dispose = vi.fn(async () => {}),
    time = vi.fn(),
    ready = vi.fn(),
    error = vi.fn();
  const api = {
    createRenderSession: () => ({
      withCanvasFrame: (
        page: Composition,
        _assets: unknown,
        present: (canvas: HTMLCanvasElement) => void,
        options: { mediaMode: string; canRender(): boolean },
      ) =>
        new Promise<void>((resolve) =>
          calls.push({
            page,
            options,
            finish() {
              if (options.canRender()) present(canvas);
              resolve();
            },
          }),
        ),
      stats: () => ({ backend: "webgpu" }),
      dispose,
    }),
  } as unknown as ToolRenderApi;
  const model = new ToolDocument(
    {
      file: new File(["video"], "clip.mp4", { type: "video/mp4" }),
      asset: {
        kind: "video",
        id: "video",
        name: "clip.mp4",
        mime: "video/mp4",
        originalId: "original",
        contentRevision: "revision",
        byteLength: 5,
        width: 320,
        height: 240,
        duration: { value: 5, rate: 1 },
        firstTimestamp: { value: 0, rate: 1 },
        timeResolution: 30,
        orientation: {
          rotation: 0,
          flip: false,
          pixelAspectRatio: { numerator: 1, denominator: 1 },
        },
      },
      duration: 5,
      hasAudio: false,
    },
    findTool("dither-video-converter")!,
  );
  const renderer = new ToolRenderer(model, api, host, new AbortController().signal, {
    ready,
    time,
    error,
  });
  async function tick(at: number) {
    now = at;
    const entry = frames.entries().next().value!;
    expect(entry).toBeDefined();
    frames.delete(entry[0]);
    entry[1](at);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  }
  await tick(16);
  expect(calls[0]!.options.mediaMode).toBe("playback");
  now = 1016; // Cold preparation took a second; the clip still starts at its first frame.
  calls[0]!.finish();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  renderer.preview({ ...model.effect(), amount: 0.4 });
  await tick(1150);
  renderer.preview({ ...model.effect(), amount: 0.6 });
  expect(calls[1]!.options.canRender()).toBe(true);
  expect(calls).toHaveLength(2); // A newer draft waits behind the one in-flight frame.
  calls[1]!.finish();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await tick(1300);
  expect(calls[2]!.page.layers[0]!.effects[0]!.amount).toBe(0.6);
  expect(time.mock.calls.at(-1)?.[0]).toBeGreaterThan(0.1);
  expect(time.mock.calls.at(-1)?.[0]).toBeLessThan(0.2);
  renderer.preview(null);
  expect(calls[2]!.options.canRender()).toBe(false);
  calls[2]!.finish();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await tick(1450);
  expect(calls[3]!.page.layers[0]!.effects[0]!.amount).toBe(model.effect().amount);
  renderer.play(false);
  calls[3]!.finish();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  renderer.preview({ ...model.effect(), amount: 0.3 });
  await tick(1600);
  expect(calls[4]!.options.mediaMode).toBe("preview");
  model.commit({ amount: 0.8 });
  renderer.update();
  expect(calls[4]!.options.canRender()).toBe(false);
  const closing = renderer.dispose();
  calls[4]!.finish();
  await closing;
  expect(ready).toHaveBeenCalledTimes(1);
  expect(error).not.toHaveBeenCalled();
  expect(dispose).toHaveBeenCalledTimes(1);
  expect(frames.size).toBe(0);
  expect(host.children).toHaveLength(0);
});
