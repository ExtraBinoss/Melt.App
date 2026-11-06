import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createLayer, createPage, createProject, EditorEngine } from "@musart/core";
import type { WeightedColor } from "../../../src/services/palettes/detection/colors";
import { useDocumentPalette } from "../../../src/components/palettes/use-document-palette";

const sampling = vi.hoisted(() => ({ sample: vi.fn(), dispose: vi.fn() }));
vi.mock("../../../src/services/palettes/detection/image-client", () => ({
  PaletteImageSampler: class {
    sample = sampling.sample;
    dispose = sampling.dispose;
  },
}));
function setupImage() {
  const page = createPage({
    id: "first",
    background: "transparent",
    width: 100,
    height: 100,
    layers: [
      createLayer("image", { id: "photo", x: 0, y: 0, width: 100, height: 100, assetId: "asset" }),
      createLayer("rectangle", {
        id: "authored",
        x: 0,
        y: 0,
        width: 10,
        height: 10,
        fill: "#00ff00",
      }),
    ],
  });
  return new EditorEngine(
    createProject({
      pages: [page, createPage({ id: "second", background: "#0000ff" })],
      assets: {
        asset: {
          id: "asset",
          mime: "image/png",
          name: "Original",
          width: 4,
          height: 4,
          dataUrl: "data:image/png;base64,eA==",
        },
      },
    }),
  );
}
beforeEach(() => {
  vi.useFakeTimers();
  sampling.sample.mockReset();
  sampling.dispose.mockClear();
});
afterEach(() => vi.useRealTimers());

it("defers detection past opening, ignores selection and rejects image results from the previous page", async () => {
  const pending: { resolve: (colors: WeightedColor[]) => void; signal: AbortSignal }[] = [];
  sampling.sample.mockImplementation(
    (_asset, signal) =>
      new Promise<WeightedColor[]>((resolve) => pending.push({ resolve, signal })),
  );
  const engine = setupImage(),
    { result, unmount } = renderHook(() => useDocumentPalette(engine, "#ffffff"));
  expect(sampling.sample).not.toHaveBeenCalled();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
  expect(sampling.sample).toHaveBeenCalledOnce();
  expect(result.current.colors[0]!.value).toBe("#00ff00");
  expect(result.current.busy).toBe(true);
  act(() => engine.select(["photo"]));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(200);
  });
  expect(sampling.sample).toHaveBeenCalledOnce();
  act(() => engine.setPage("second"));
  expect(pending[0]!.signal.aborted).toBe(true);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
  expect(result.current.colors[0]!.value).toBe("#0000ff");
  await act(async () => pending[0]!.resolve([{ value: "#ff0000", weight: 1 }]));
  expect(result.current.colors.some((color) => color.value === "#ff0000")).toBe(false);
  unmount();
  expect(sampling.dispose).toHaveBeenCalledOnce();
});

it("combines decoded originals with authored colors and preserves authored fallback on a real failure", async () => {
  sampling.sample.mockResolvedValue([{ value: "#ff0000", weight: 1 }]);
  const engine = setupImage(),
    { result, unmount } = renderHook(() => useDocumentPalette(engine, "#ffffff"));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
  expect(result.current.colors.map((color) => color.value)).toEqual(["#ff0000", "#00ff00"]);
  expect(result.current.busy).toBe(false);
  sampling.sample.mockRejectedValue(Error("Image decode failed"));
  act(() =>
    engine.execute({ type: "updateLayers", ids: ["authored"], patch: { fill: "#ffff00" } }),
  );
  await act(async () => {
    await vi.advanceTimersByTimeAsync(120);
  });
  expect(result.current).toMatchObject({ busy: false, error: "Image decode failed" });
  expect(result.current.colors.map((color) => color.value)).toEqual(["#ffff00"]);
  unmount();
});

it("cancels pending detection on unmount and resolves a literal fallback without an engine", async () => {
  const request: { signal?: AbortSignal } = {};
  sampling.sample.mockImplementation((_asset, nextSignal) => {
    request.signal = nextSignal;
    return new Promise(() => {});
  });
  const engine = setupImage();
  const { unmount } = renderHook(() => useDocumentPalette(engine, "#fff"));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
  unmount();
  expect(request.signal?.aborted).toBe(true);
  const local = renderHook(() => useDocumentPalette(undefined, "#abc"));
  expect(local.result.current).toEqual({
    colors: [{ id: "detected-aabbcc", name: "#aabbcc", value: "#aabbcc" }],
    busy: false,
  });
  local.unmount();
});
