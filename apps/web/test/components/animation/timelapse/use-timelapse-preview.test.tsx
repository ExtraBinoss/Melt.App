import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { useLayoutEffect } from "react";
import {
  createLayer,
  createPage,
  createProject,
  EditorEngine,
  recordSession,
  type ReplaySpec,
} from "@musart/core";
import { useTimelapsePreview } from "../../../../src/components/animation/timelapse/use-timelapse-preview";
import { Slider } from "../../../../src/components/ui/slider";
import * as core from "@musart/core";

const gpu = vi.hoisted(() => ({
  dispose: vi.fn(),
  frames: [] as unknown[],
  fail: false,
  contexts: 0,
  options: [] as { scale: number; maxImageDimension: number; imageSourceScale: number }[],
}));
vi.mock("@musart/render", () => ({
  estimatePreviewCost: () => ({ fixedBytes: 0, maxDimension: 0 }),
  createRenderSession: () => {
    gpu.contexts++;
    const canvas = document.createElement("canvas");
    return {
      dispose: gpu.dispose,
      withCanvasFrame: async (
        page: unknown,
        _assets: unknown,
        consume: (canvas: HTMLCanvasElement) => void,
        options: { scale: number; maxImageDimension: number; imageSourceScale: number },
      ) => {
        if (gpu.fail) throw new Error("GPU failed");
        gpu.frames.push(page);
        gpu.options.push(options);
        consume(canvas);
      },
    };
  },
}));
function replay() {
  const layer = createLayer("rectangle", { id: "shape", x: 0, width: 8, height: 8 });
  const engine = new EditorEngine(
    createProject({ pages: [createPage({ id: "page", width: 32, height: 32, layers: [layer] })] }),
  );
  let time = 0;
  const recording = recordSession(engine, { now: () => time });
  time = 1000;
  engine.execute({ type: "updateLayers", ids: [layer.id], patch: { x: 16 } });
  return recording.stop();
}
let player: ReturnType<typeof useTimelapsePreview>;
let renders = 0;
function Harness({ spec, duration = 1 }: { spec: ReplaySpec; duration?: number }) {
  renders++;
  const { viewport, slider, clock, controls, status, error, playing } = useTimelapsePreview(
    spec,
    "page",
    duration,
    true,
  );
  useLayoutEffect(() => {
    player = { viewport, slider, clock, controls, status, error, playing };
  });
  return (
    <>
      <div ref={viewport} data-testid="surface" />
      <Slider aria-label="Preview position" valueSource={slider} min={0} max={duration} />
      <output ref={clock} />
      <span>{status}</span>
      <span>{String(playing)}</span>
    </>
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  gpu.frames = [];
  gpu.fail = false;
  gpu.contexts = 0;
  gpu.options = [];
  gpu.dispose.mockResolvedValue(undefined);
  renders = 0;
});

test("uses the export sample mapper, retains one GPU context and updates preview position imperatively", async () => {
  const evaluate = vi.spyOn(core, "evaluateReplay");
  const spec = replay();
  const view = render(<Harness spec={spec} />);
  await screen.findByText("ready");
  expect(screen.getByTestId("surface").dataset.historyTime).toBe("0");
  const before = renders;
  act(() => player.controls.current?.seek(1));
  await waitFor(() => expect(screen.getByTestId("surface").dataset.historyTime).toBe("1000"));
  expect(gpu.frames.at(-1)).toMatchObject({ layers: [{ x: 16 }] });
  expect(evaluate.mock.calls.filter(([, time]) => time === spec.duration)).toHaveLength(2);
  expect(renders).toBe(before);
  expect(screen.getByRole("status")).toHaveTextContent("1.0 / 1 s");
  expect(screen.getByRole("slider")).toHaveAttribute("aria-valuenow", "1");
  view.rerender(<Harness spec={spec} duration={2} />);
  await waitFor(() => expect(screen.getByTestId("surface").dataset.historyTime).toBe("0"));
  expect(gpu.contexts).toBe(1);
  view.unmount();
  await waitFor(() => expect(gpu.dispose).toHaveBeenCalledOnce());
});

test("schedules playback without per-frame React state and cancels the clock on pause/unmount", async () => {
  const view = render(<Harness spec={replay()} />);
  await screen.findByText("ready");
  let tick!: FrameRequestCallback;
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    tick = callback;
    return 42;
  });
  const cancel = vi.spyOn(window, "cancelAnimationFrame");
  const started = performance.now();
  act(() => player.controls.current?.play());
  expect(screen.getByText("true")).toBeVisible();
  const before = renders;
  await act(async () => {
    tick(started + 500);
  });
  expect(renders).toBe(before);
  await act(async () => {
    tick(started + 1500);
  });
  expect(screen.getByText("false")).toBeVisible();
  expect(screen.getByTestId("surface").dataset.historyTime).toBe("1000");
  act(() => player.controls.current?.play());
  act(() => player.controls.current?.pause());
  expect(cancel).toHaveBeenCalledWith(42);
  view.unmount();
});

test("reports GPU and missing-page failures instead of claiming preview readiness", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  gpu.fail = true;
  const view = render(<Harness spec={replay()} />);
  await screen.findByText("failed");
  expect(screen.queryByText("ready")).toBeNull();
  expect(player.error).toBeInstanceOf(Error);
  expect(gpu.dispose).toHaveBeenCalledOnce();
  expect(log).toHaveBeenCalledWith(
    "[Melt timelapse preview failed]",
    { pageId: "page" },
    player.error,
  );
  view.unmount();
  gpu.fail = false;
  const spec = replay();
  const next = render(
    <Harness spec={{ ...spec, initial: { ...spec.initial, pages: [] }, events: [] }} />,
  );
  await screen.findByText("failed");
  next.unmount();
});

test("bounds all replay original uploads independently of output dimensions and preserves composition room", async () => {
  const spec = { ...replay() };
  spec.assets = Object.fromEntries(
    Array.from({ length: 50 }, (_, i) => [
      String(i),
      {
        id: String(i),
        name: "large original",
        width: 4096,
        height: 4096,
        mime: "image/png",
        dataUrl:
          "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIW2P4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==",
      },
    ]),
  );
  const view = render(<Harness spec={spec} />);
  await screen.findByText("ready");
  const options = gpu.options[0]!;
  expect(options.maxImageDimension).toBeLessThanOrEqual(480);
  expect(50 * options.maxImageDimension ** 2 * 4).toBeLessThanOrEqual(16 * 1024 * 1024);
  expect(options.imageSourceScale).toBe(options.scale);
  view.unmount();
});

test("waits for retired preview resources before opening a replacement renderer", async () => {
  const first = replay();
  const view = render(<Harness spec={first} />);
  await screen.findByText("ready");
  let retired!: () => void;
  gpu.dispose.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        retired = resolve;
      }),
  );
  view.rerender(<Harness spec={replay()} />);
  await screen.findByText("preparing");
  expect(gpu.contexts).toBe(1);
  await act(async () => retired());
  await screen.findByText("ready");
  expect(gpu.contexts).toBe(2);
  view.unmount();
});
