import type { ArtboardPlacement, ArtboardWorkspace } from "./layout";
import type { View } from "../viewport/view";

/** Anchor to the outside bottom-right corner; keep distant boards visually quiet. */
export function artboardFooterPosition(
  board: ArtboardPlacement,
  workspace: ArtboardWorkspace,
  view: View,
) {
  const scale = artboardFooterScale(view),
    gap = 6 * scale;
  const x = view.x + (board.x + board.width - workspace.width / 2) * view.zoom - gap;
  const y = view.y + (board.y + board.height - workspace.height / 2) * view.zoom + 10 * scale;
  return `translate3d(${x}px, ${y}px, 0) scale(${scale}) translate(-100%, 0)`;
}
export const artboardFooterScale = (view: View) =>
  Math.min(1, Math.max(0.45, Math.sqrt(view.zoom)));
export const artboardFooterSmall = (board: ArtboardPlacement, view: View) =>
  board.width * view.zoom < 64 || board.height * view.zoom < 50;
