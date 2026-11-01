import { expect, test, vi } from "vitest";
import { Vector2, Vector4 } from "three/webgpu";
import { ExactCanvasTarget } from "../../../src/canvas/render/exact-canvas-target";
import { DrawingDensity } from "../../../src/canvas/render/drawing-density";

test("R3F sizing intent never reallocates the old exact frame; one physical commit preserves fractional texels", () => {
  const canvas = document.createElement("canvas"),
    target = new ExactCanvasTarget(canvas),
    density = new DrawingDensity();
  const dimensions: { axis: string; value: number }[] = [];
  for (const axis of ["width", "height"] as const) {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, axis)!;
    Object.defineProperty(canvas, axis, {
      configurable: true,
      get: () => descriptor.get!.call(canvas),
      set: (value: number) => {
        dimensions.push({ axis, value });
        descriptor.set!.call(canvas, value);
      },
    });
  }
  const setDpr = (dpr: number) => {
    target.setPixelRatio(dpr);
    target.setSize(778, 17);
  };
  target.setSize(778, 17);
  density.apply(0.20435, setDpr, 159, 4);
  expect(dimensions).toEqual([]);
  const renderer = {
    domElement: canvas,
    setDrawingBufferSize: (w: number, h: number, ratio: number) =>
      target.setDrawingBufferSize(w, h, ratio),
  };
  density.prepare(renderer);
  expect(dimensions).toEqual([
    { axis: "width", value: 159 },
    { axis: "height", value: 4 },
  ]);
  expect(canvas.style.width).toBe("778px");
  expect(canvas.style.height).toBe("17px");
  expect(target.getPixelRatio()).toBe(1);
  expect(target.getSize(new Vector2()).toArray()).toEqual([159, 4]);
  expect(target.getDrawingBufferSize(new Vector2()).toArray()).toEqual([159, 4]);
  expect(target.getViewport(new Vector4()).toArray()).toEqual([0, 0, 159, 4]);
  for (let frame = 0; frame < 60; frame++) {
    density.apply(0.20435, setDpr, 159, 4);
    density.prepare(renderer);
  }
  expect(dimensions).toHaveLength(2);
  density.apply(2, setDpr, 317, 8);
  expect(dimensions).toHaveLength(2);
  density.prepare(renderer);
  expect(dimensions.slice(2)).toEqual([
    { axis: "width", value: 317 },
    { axis: "height", value: 8 },
  ]);
  expect(target.getPixelRatio()).toBe(1);
  expect(density.bounds).toEqual([2, 2]);
  const disposed = vi.fn();
  target.addEventListener("dispose", disposed);
  target.dispose();
  target.dispose();
  expect(disposed).toHaveBeenCalledOnce();
});

test("rejects invalid exact backing dimensions and leaves CSS alone for non-style requests", () => {
  const canvas = document.createElement("canvas"),
    target = new ExactCanvasTarget(canvas);
  target.setSize(20, 30, false);
  expect(canvas.style.cssText).toBe("");
  for (const width of [0, -1, NaN, Infinity])
    expect(() => target.setDrawingBufferSize(width, 4, 1)).toThrow("dimensions");
  target.setDrawingBufferSize(20, 30, 2);
  expect(target.getDrawingBufferSize(new Vector2()).toArray()).toEqual([40, 60]);
  expect(target.getPixelRatio()).toBe(1);
  target.dispose();
});
