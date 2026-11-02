import { expect, it } from "vitest";
import { arrangeArtboards } from "../../../src/canvas/artboards/layout";
import { artboardStyle, paintArtboards } from "../../../src/canvas/artboards/presentation";
import {
  artboardFooterPosition,
  artboardPerformancePosition,
} from "../../../src/canvas/artboards/footer-layout";

it("imperatively positions active/inactive frames and unscaled headings from the same world pose", () => {
  const workspace = arrangeArtboards([
      { id: "a", name: "A", width: 200, height: 160 },
      { id: "b", name: "B", width: 300, height: 100 },
    ]),
    view = { x: 10, y: 20, zoom: 2 },
    root = document.createElement("div");
  root.innerHTML =
    '<div data-artboard-id="a"></div><div data-artboard-id="b"></div><div data-artboard-id="a" class="artboard-heading"></div><div data-artboard-id="gone"></div>';
  paintArtboards(root, workspace, view);
  expect(root.children[0]).toHaveStyle({
    width: "200px",
    height: "160px",
    marginLeft: "-100px",
    marginTop: "-80px",
    transform: "translate3d(-418px, 20px, 0) scale(2)",
  });
  expect(root.children[1]).toHaveStyle({
    width: "300px",
    marginLeft: "-150px",
    marginTop: "-50px",
  });
  expect(root.children[2]).toHaveStyle({
    marginLeft: "0px",
    marginTop: "0px",
    transform: "translate3d(-618px, -172px, 0)",
    maxWidth: "400px",
  });
  expect((root.children[3] as HTMLElement).style.cssText).toBe("");
  expect(artboardStyle(workspace.boards[0]!, workspace, view).transform).toBe(
    "translate3d(-418px, 20px, 0) scale(2)",
  );
});

it("skips repeated style and dataset writes while retaining heading and footer motion", () => {
  const workspace = arrangeArtboards([{ id: "a", name: "A", width: 200, height: 160 }]),
    view = { x: 10, y: 20, zoom: 2 },
    root = document.createElement("div");
  root.innerHTML =
    '<div data-artboard-id="a"></div><div data-artboard-id="a" class="artboard-heading"></div><div data-artboard-id="a" class="artboard-mode-footer"></div><div data-artboard-id="a" class="artboard-performance-footer"></div>';
  paintArtboards(root, workspace, view);
  const observer = new MutationObserver(() => {});
  observer.observe(root, { attributes: true, subtree: true });
  paintArtboards(root, workspace, { ...view });
  expect(observer.takeRecords()).toEqual([]);
  const next = { x: 35, y: -10, zoom: 0.2 };
  paintArtboards(root, workspace, next);
  const board = workspace.boards[0]!;
  expect(root.children[0]).toHaveStyle({
    transform: artboardStyle(board, workspace, next).transform,
  });
  expect(root.children[2]).toHaveStyle({
    transform: artboardFooterPosition(board, workspace, next),
  });
  expect(root.children[3]).toHaveStyle({
    transform: artboardPerformancePosition(board, workspace, next),
  });
  expect(root.children[2]).toHaveAttribute("data-small", "true");
  expect(root.children[3]).toHaveAttribute("data-compact", "true");
  expect(root.children[1]).toHaveStyle({ width: "96px" });
  expect(observer.takeRecords().length).toBeGreaterThan(0);
  paintArtboards(root, workspace, next);
  expect(observer.takeRecords()).toEqual([]);
  observer.disconnect();
});
