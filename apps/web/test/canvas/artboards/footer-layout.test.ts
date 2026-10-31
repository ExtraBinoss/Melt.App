import { expect, it } from "vitest";
import { arrangeArtboards } from "../../../src/canvas/artboards/layout";
import { artboardFooterPosition } from "../../../src/canvas/artboards/footer-layout";

it("anchors the scaled mode below the bottom-right corner away from headings", () => {
  const workspace = arrangeArtboards([{ id: "one", name: "One", width: 200, height: 100 }]);
  expect(artboardFooterPosition(workspace.boards[0]!, workspace, { x: 10, y: 20, zoom: 2 })).toBe(
    "translate3d(204px, 130px, 0) scale(1) translate(-100%, 0)",
  );
  expect(
    artboardFooterPosition(workspace.boards[0]!, workspace, { x: 10, y: 20, zoom: 0.01 }),
  ).toBe("translate3d(8.3px, 25px, 0) scale(0.45) translate(-100%, 0)");
});
