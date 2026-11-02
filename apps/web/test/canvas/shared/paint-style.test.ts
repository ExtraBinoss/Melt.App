import { expect, it, vi } from "vitest";
import { paintCanvasStyle } from "../../../src/canvas/shared/paint-style";

it("deduplicates native transform serializations and repairs external style changes", () => {
  const node = document.createElement("div"),
    matrix = "matrix(1,0,0,1,0,0)",
    translation = "translate3d(10px, 20px, 0) scale(2)",
    serializations = new Map([
      [matrix, "matrix(1, 0, 0, 1, 0, 0)"],
      [translation, "translate3d(10px, 20px, 0px) scale(2)"],
    ]);
  let actual = "";
  const write = vi.fn((value: string) => {
    actual = serializations.get(value) ?? value;
  });
  Object.defineProperty(node.style, "transform", {
    configurable: true,
    get: () => actual,
    set: write,
  });
  paintCanvasStyle(node, { transform: matrix });
  expect(actual).toBe(serializations.get(matrix));
  paintCanvasStyle(node, { transform: matrix });
  expect(write).toHaveBeenCalledTimes(1);
  actual = "scale(3)";
  paintCanvasStyle(node, { transform: matrix });
  expect(actual).toBe(serializations.get(matrix));
  expect(write).toHaveBeenCalledTimes(2);
  paintCanvasStyle(node, { transform: translation });
  expect(actual).toBe(serializations.get(translation));
  paintCanvasStyle(node, { transform: translation });
  expect(write).toHaveBeenCalledTimes(3);
  paintCanvasStyle(node, { transform: "scale(4)" });
  paintCanvasStyle(node, { transform: "scale(4)" });
  expect(write).toHaveBeenCalledTimes(4);
});
