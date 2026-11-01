import { expect, it } from "vitest";
import { arrangeArtboards } from "../../../src/canvas/artboards/layout";
import {
  artboardFooterPosition,
  artboardPerformancePosition,
} from "../../../src/canvas/artboards/footer-layout";

it("anchors the scaled mode below the bottom-right corner away from headings", () => {
  const workspace = arrangeArtboards([{ id: "one", name: "One", width: 200, height: 100 }]);
  expect(artboardFooterPosition(workspace.boards[0]!, workspace, { x: 10, y: 20, zoom: 2 })).toBe(
    "translate3d(210px, 130px, 0) scale(1) translate(-100%, 0)",
  );
  expect(
    artboardFooterPosition(workspace.boards[0]!, workspace, { x: 10, y: 20, zoom: 0.01 }),
  ).toBe("translate3d(11px, 25px, 0) scale(0.45) translate(-100%, 0)");
});

it.each([0.01, 0.2, 1, 2])(
  "keeps opposite footer edges flush with an offset artboard at %sx",
  (zoom) => {
    const workspace = arrangeArtboards([
        { id: "one", name: "One", width: 200, height: 100 },
        { id: "two", name: "Two", width: 360, height: 240 },
      ]),
      view = { x: 77, y: -38, zoom },
      board = workspace.boards[1]!,
      projectedLeft = view.x + (board.x - workspace.width / 2) * zoom,
      projectedRight = projectedLeft + board.width * zoom,
      mode = artboardFooterPosition(board, workspace, view),
      performance = artboardPerformancePosition(board, workspace, view);
    expect(Number(mode.match(/translate3d\(([^p]+)px/)![1])).toBeCloseTo(projectedRight);
    expect(Number(performance.match(/translate3d\(([^p]+)px/)![1])).toBeCloseTo(projectedLeft);
    expect(mode.slice(mode.indexOf(","), mode.indexOf(" scale"))).toBe(
      performance.slice(performance.indexOf(","), performance.indexOf(" scale")),
    );
  },
);
