import type { RefObject } from "react";
import type { ArtboardPlacement, ArtboardWorkspace } from "../artboards/layout";
import type { View } from "../viewport/view";
import { artboardStyle } from "../artboards/presentation";
/** Keep page-local selection coordinates while painting above workspace headings and backdrops. */
export function CanvasMarquee({
  board,
  workspace,
  view,
  element,
}: {
  board: ArtboardPlacement;
  workspace: ArtboardWorkspace;
  view: View;
  element: RefObject<HTMLDivElement | null>;
}) {
  return (
    <div
      className="canvas-marquee-plane"
      data-artboard-id={board.id}
      style={artboardStyle(board, workspace, view)}
    >
      <div ref={element} className="canvas-marquee" hidden />
    </div>
  );
}
