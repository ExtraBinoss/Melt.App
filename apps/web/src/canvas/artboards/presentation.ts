import type { View } from "../viewport/view";
import { viewForArtboard, type ArtboardPlacement, type ArtboardWorkspace } from "./layout";
import { layoutArtboardHeadings } from "./heading-layout";
import { paintCanvasStyle } from "../shared/paint-style";
import {
  artboardFooterPosition,
  artboardFooterSmall,
  artboardPerformancePosition,
} from "./footer-layout";

export function artboardStyle(board: ArtboardPlacement, workspace: ArtboardWorkspace, view: View) {
  const local = viewForArtboard(view, workspace, board);
  return {
    width: board.width,
    height: board.height,
    marginLeft: -board.width / 2,
    marginTop: -board.height / 2,
    transform: `translate3d(${local.x}px, ${local.y}px, 0) scale(${view.zoom})`,
  };
}

/** Shared imperative painting avoids React commits during wheel/trackpad motion. */
export function paintArtboards(root: HTMLElement, workspace: ArtboardWorkspace, view: View) {
  const headings = new Map(
      layoutArtboardHeadings(workspace, view).map((heading) => [heading.id, heading]),
    ),
    boards = new Map(workspace.boards.map((board) => [board.id, board]));
  for (const element of root.querySelectorAll<HTMLElement>("[data-artboard-id]")) {
    const board = boards.get(element.dataset.artboardId!);
    if (!board) continue;
    if (element.classList.contains("artboard-performance-footer")) {
      const transform = artboardPerformancePosition(board, workspace, view),
        small = String(artboardFooterSmall(board, view)),
        compact = String(board.width * view.zoom < 180);
      paintCanvasStyle(element, { transform });
      if (element.dataset.small !== small) element.dataset.small = small;
      if (element.dataset.compact !== compact) element.dataset.compact = compact;
      continue;
    }
    if (element.classList.contains("artboard-mode-footer")) {
      const transform = artboardFooterPosition(board, workspace, view),
        compact = String(board.width * view.zoom < 180),
        small = String(artboardFooterSmall(board, view));
      paintCanvasStyle(element, { transform });
      if (element.dataset.compact !== compact) element.dataset.compact = compact;
      if (element.dataset.small !== small) element.dataset.small = small;
      continue;
    }
    if (element.classList.contains("artboard-heading")) {
      const heading = headings.get(board.id)!,
        transform = `translate3d(${heading.x}px, ${heading.y}px, 0)`,
        width = `${heading.width}px`,
        stem = `${heading.stem}px`,
        compact = String(heading.compact),
        displaced = String(heading.stem > 6);
      paintCanvasStyle(element, {
        marginLeft: "0px",
        marginTop: "0px",
        transform,
        width,
        maxWidth: width,
      });
      if (element.style.getPropertyValue("--artboard-stem") !== stem)
        element.style.setProperty("--artboard-stem", stem);
      if (element.dataset.compact !== compact) element.dataset.compact = compact;
      if (element.dataset.displaced !== displaced) element.dataset.displaced = displaced;
      continue;
    }
    const style = artboardStyle(board, workspace, view),
      width = `${style.width}px`,
      height = `${style.height}px`,
      marginLeft = `${style.marginLeft}px`,
      marginTop = `${style.marginTop}px`;
    paintCanvasStyle(element, { width, height, marginLeft, marginTop, transform: style.transform });
  }
}
