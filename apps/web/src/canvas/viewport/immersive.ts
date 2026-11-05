import type { ArtboardWorkspace } from "../artboards/layout";
import type { View } from "./view";

export function immersiveView(
  layout: ArtboardWorkspace,
  size: { width: number; height: number },
  pageId: string,
  current?: View,
): View {
  const board = layout.boards.find((item) => item.id === pageId) ?? layout.boards[0];
  if (!board || size.width <= 0 || size.height <= 0) return current ?? { x: 0, y: 0, zoom: 1 };
  const zoom = Math.max(current?.zoom ?? 0, size.width / board.width, size.height / board.height);
  const centerX = -(board.x + board.width / 2 - layout.width / 2) * zoom;
  const centerY = -(board.y + board.height / 2 - layout.height / 2) * zoom;
  const dx = Math.max(0, (board.width * zoom - size.width) / 2),
    dy = Math.max(0, (board.height * zoom - size.height) / 2);
  return {
    zoom,
    x: Math.min(centerX + dx, Math.max(centerX - dx, current?.x ?? centerX)),
    y: Math.min(centerY + dy, Math.max(centerY - dy, current?.y ?? centerY)),
  };
}
