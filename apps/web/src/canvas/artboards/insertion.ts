import { createPage, type Command, type EnginePort } from "@musart/core";
import { ARTBOARD_GAP, type ArtboardWorkspace, type ArtboardPlacement } from "./layout";
import type { Point, View } from "../viewport/view";

export type ArtboardSide = "top" | "right" | "bottom" | "left";
export interface ArtboardInsertion {
  sourceId: string;
  side: ArtboardSide;
  x: number;
  y: number;
  width: number;
  height: number;
}
const overlap = (a: ArtboardInsertion, b: ArtboardPlacement) =>
  a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
export function artboardInsertions(workspace: ArtboardWorkspace): ArtboardInsertion[] {
  return workspace.boards.flatMap((board) =>
    (["top", "right", "bottom", "left"] as const).flatMap((side) => {
      const x =
          board.x +
          (side === "right"
            ? board.width + ARTBOARD_GAP
            : side === "left"
              ? -board.width - ARTBOARD_GAP
              : 0),
        y =
          board.y +
          (side === "bottom"
            ? board.height + ARTBOARD_GAP
            : side === "top"
              ? -board.height - ARTBOARD_GAP
              : 0);
      const candidate = {
        sourceId: board.id,
        side,
        x,
        y,
        width: board.width,
        height: board.height,
      };
      return workspace.boards.some((other) => overlap(candidate, other)) ? [] : [candidate];
    }),
  );
}
export function insertionButton(
  candidate: ArtboardInsertion,
  workspace: ArtboardWorkspace,
  view: View,
): Point {
  const board = workspace.boards.find((board) => board.id === candidate.sourceId)!;
  const gap =
    candidate.side === "top" ? 52 : Math.max(18, Math.min(34, (ARTBOARD_GAP * view.zoom) / 2));
  return {
    x:
      view.x +
      (board.x + board.width / 2 - workspace.width / 2) * view.zoom +
      (candidate.side === "right"
        ? (board.width * view.zoom) / 2 + gap
        : candidate.side === "left"
          ? (-board.width * view.zoom) / 2 - gap
          : 0),
    y:
      view.y +
      (board.y + board.height / 2 - workspace.height / 2) * view.zoom +
      (candidate.side === "bottom"
        ? (board.height * view.zoom) / 2 + gap
        : candidate.side === "top"
          ? (-board.height * view.zoom) / 2 - gap
          : 0),
  };
}
export function insertArtboard(
  engine: EnginePort,
  workspace: ArtboardWorkspace,
  candidate: ArtboardInsertion,
  name: string,
) {
  const snapshot = engine.getSnapshot(),
    source = snapshot.project.pages.find((page) => page.id === candidate.sourceId);
  const available = artboardInsertions(workspace).find(
    (item) => item.sourceId === candidate.sourceId && item.side === candidate.side,
  );
  if (
    !source ||
    !available ||
    available.x !== candidate.x ||
    available.y !== candidate.y ||
    available.width !== candidate.width ||
    available.height !== candidate.height
  )
    throw new Error("STALE_ARTBOARD_PLACEMENT");
  const origin = workspace.origin ?? { x: 0, y: 0 };
  const commands: Command[] = workspace.boards.flatMap((board) =>
    snapshot.project.pages.find((page) => page.id === board.id)?.canvasPosition
      ? []
      : [
          {
            type: "updatePage" as const,
            targetId: board.id,
            patch: { canvasPosition: { x: board.x + origin.x, y: board.y + origin.y } },
          },
        ],
  );
  const page = createPage({
    name,
    width: source.width,
    height: source.height,
    background: source.background,
    backgroundGradient: source.backgroundGradient,
    ...(source.colorSpace ? { colorSpace: source.colorSpace } : {}),
    canvasPosition: { x: candidate.x + origin.x, y: candidate.y + origin.y },
  });
  engine.transaction([...commands, { type: "addPage", page }]);
  return page.id;
}
