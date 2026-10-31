import { afterEach, expect, test, vi } from "vitest";
import { createElement } from "react";
import { findTool } from "../../../src/tools/catalog";
import type { ToolSource } from "../../../src/tools/converter/types";
const harness = vi.hoisted(() => ({
  prepare: vi.fn(),
  exportVideo: vi.fn(),
  renderers: [] as {
    callbacks: { ready(): void; error(error: unknown): void };
    dispose: ReturnType<typeof vi.fn<() => Promise<void>>>;
    image: ReturnType<typeof vi.fn<() => Promise<Blob>>>;
    playing: boolean;
  }[],
}));
vi.mock("../../../src/tools/converter/media", () => ({ prepareToolSource: harness.prepare }));
vi.mock("@musart/render", () => ({
  createRenderSession: vi.fn(),
  probeVideoOriginal: vi.fn(),
  exportMotionVideo: harness.exportVideo,
}));
vi.mock("../../../src/tools/converter/renderer", () => ({
  ToolRenderer: class {
    playing = false;
    dispose = vi.fn(async () => {});
    image = vi.fn(async () => new Blob(["image"], { type: "image/png" }));
    preview = vi.fn();
    compare = vi.fn();
    play = vi.fn();
    freeze = vi.fn();
    update = vi.fn();
    seek = vi.fn();
    constructor(
      _model: unknown,
      _api: unknown,
      _host: unknown,
      _signal: unknown,
      readonly callbacks: { ready(): void; error(error: unknown): void },
    ) {
      harness.renderers.push(this);
    }
  },
}));
import { ToolController } from "../../../src/tools/converter/controller";
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const file = (name: string) => new File(["pixels"], `${name}.png`, { type: "image/png" });
function source(file: File): ToolSource {
  return {
    file,
    asset: {
      id: file.name,
      name: file.name,
      width: 64,
      height: 64,
      mime: "image/png",
      dataUrl: "data:image/png;base64,AA==",
    },
    duration: 0,
    hasAudio: false,
  };
}
let controller: ToolController | undefined;
afterEach(async () => {
  await controller?.dispose();
  controller = undefined;
  harness.prepare.mockReset();
  harness.renderers.length = 0;
  vi.restoreAllMocks();
});
test("replacement coalesces to the latest source, rejects stale ready/error callbacks and disposes the previous renderer before publication", async () => {
  const first = file("first"),
    second = file("second"),
    third = file("third");
  const pending = deferred<ToolSource>();
  harness.prepare.mockImplementation(async (file: File) =>
    file === first ? pending.promise : source(file),
  );
  const activity = vi.fn();
  controller = new ToolController(document.createElement("div"), activity);
  controller.open(first, findTool("ascii-image-converter")!);
  await vi.waitFor(() => expect(harness.prepare).toHaveBeenCalledTimes(1));
  controller.open(second, findTool("ascii-image-converter")!);
  controller.open(third, findTool("ascii-image-converter")!);
  expect((harness.prepare.mock.calls[0]![3] as AbortSignal).aborted).toBe(true);
  pending.resolve(source(first));
  await vi.waitFor(() => expect(harness.renderers).toHaveLength(1));
  expect(harness.prepare.mock.calls.map((call) => (call[0] as File).name)).toEqual([
    "first.png",
    "third.png",
  ]);
  const old = harness.renderers[0]!;
  old.callbacks.ready();
  expect(controller.read()).toMatchObject({ phase: "ready", name: "third.png" });
  const disposal = deferred<void>();
  old.dispose.mockImplementation(() => disposal.promise);
  controller.open(second, findTool("ascii-image-converter")!);
  old.callbacks.ready();
  old.callbacks.error(new Error("late"));
  expect(controller.read()).toMatchObject({ phase: "preparing", name: "second.png", error: null });
  await vi.waitFor(() => expect(old.dispose).toHaveBeenCalledTimes(1));
  expect(harness.renderers).toHaveLength(1);
  disposal.resolve();
  await vi.waitFor(() => expect(harness.renderers).toHaveLength(2));
  harness.renderers[1]!.callbacks.ready();
  expect(controller.read()).toMatchObject({ phase: "ready", name: "second.png" });
  expect(activity).toHaveBeenLastCalledWith(second, false);
});
test("a real preparation failure is visible, retry recovers, disposal rejects late work without publishing or starting a renderer", async () => {
  const next = file("broken");
  harness.prepare
    .mockRejectedValueOnce(new Error("decode failed"))
    .mockImplementation(async (file: File) => source(file));
  controller = new ToolController(document.createElement("div"), vi.fn());
  controller.open(next, findTool("ascii-image-converter")!);
  await vi.waitFor(() => expect(controller!.read().phase).toBe("error"));
  expect((controller.read().error as Error).message).toBe("decode failed");
  const pending = deferred<ToolSource>();
  harness.prepare.mockImplementation(() => pending.promise);
  controller.open(next, findTool("ascii-image-converter")!);
  await vi.waitFor(() => expect(harness.prepare).toHaveBeenCalledTimes(2));
  const dispose = controller.dispose();
  pending.resolve(source(next));
  await dispose;
  expect(harness.renderers).toHaveLength(0);
  controller.open(file("after-close"), findTool("ascii-image-converter")!);
  expect(harness.prepare).toHaveBeenCalledTimes(2);
});
test("replacing a file aborts a pending image export and never downloads its obsolete result", async () => {
  harness.prepare.mockImplementation(async (file: File) => source(file));
  controller = new ToolController(document.createElement("div"), vi.fn());
  controller.open(file("first"), findTool("ascii-image-converter")!);
  await vi.waitFor(() => expect(harness.renderers).toHaveLength(1));
  harness.renderers[0]!.callbacks.ready();
  const output = deferred<Blob>();
  harness.renderers[0]!.image.mockImplementation(() => output.promise);
  const click = vi.spyOn(HTMLAnchorElement.prototype, "click");
  const exporting = controller.download("png");
  controller.open(file("next"), findTool("ascii-image-converter")!);
  expect(
    (harness.renderers[0]!.image.mock.calls[0] as unknown as [string, AbortSignal])[1].aborted,
  ).toBe(true);
  output.resolve(new Blob(["obsolete"], { type: "image/png" }));
  await exporting;
  await vi.waitFor(() => expect(harness.renderers).toHaveLength(2));
  expect(click).not.toHaveBeenCalled();
  await vi.waitFor(() => expect(harness.renderers[0]!.dispose).toHaveBeenCalledTimes(1));
});

test("StrictMode effect replay leaves one usable controller and unmount disposes the live renderer", async () => {
  const { StrictMode } = await import("react");
  const { render, act, screen } = await import("@testing-library/react");
  await import("../../../src/tools/messages");
  const { ToolWorkspace } = await import("../../../src/tools/converter/ToolWorkspace");
  harness.prepare.mockImplementation(async (file: File) => source(file));
  const next = file("strict"),
    host = document.createElement("div"),
    activity = vi.fn();
  const view = render(
    createElement(
      StrictMode,
      null,
      createElement(ToolWorkspace, {
        file: next,
        tool: findTool("ascii-image-converter")!,
        host,
        onActivity: activity,
      }),
    ),
  );
  await vi.waitFor(() => expect(harness.renderers).toHaveLength(1));
  act(() => harness.renderers[0]!.callbacks.ready());
  expect(screen.getByRole("button", { name: /Download image|Télécharger l’image/ })).toBeEnabled();
  view.unmount();
  await vi.waitFor(() => expect(harness.renderers[0]!.dispose).toHaveBeenCalledTimes(1));
});
