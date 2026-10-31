import { expect, it } from "vitest";
import { createLayer } from "@musart/core";
import { selectionHandleInk } from "../../../src/canvas/selection/handle-color";

it("chooses one opaque black or white ink from solid, alpha and gradient paint", () => {
  const light = { background: "#ffffff" },
    dark = { background: "#000000" };
  const layer = createLayer("rectangle", { fill: "#ffffff" });
  expect(selectionHandleInk(layer, light)).toBe("#000000");
  expect(selectionHandleInk({ ...layer, fill: "#000" }, light)).toBe("#ffffff");
  expect(selectionHandleInk({ ...layer, fill: "#fff0" }, dark)).toBe("#ffffff");
  expect(selectionHandleInk({ ...layer, fill: "#ffffff00" }, light)).toBe("#000000");
  expect(selectionHandleInk({ ...layer, fill: "#000", opacity: 0 }, light)).toBe("#000000");
  expect(
    selectionHandleInk(
      {
        ...layer,
        fillGradient: {
          kind: "linear",
          angle: 0,
          stops: [
            { offset: 0, color: "#000" },
            { offset: 1, color: "#111" },
          ],
        },
      },
      light,
    ),
  ).toBe("#ffffff");
});
