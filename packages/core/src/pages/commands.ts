import { pruneSceneMotionProperties } from "../motion/scene/structure";
import { arrangeArtboards } from "./workspace";
import { ensure } from "../errors";
import { createPage } from "../document/factories";
import type { CommandHandler } from "../session/context";
export const addPage: CommandHandler<"addPage"> = ({ project, nextId }, command) => {
  const page =
    command.page ??
    createPage({ id: nextId("page"), name: `Composition ${project.pages.length + 1}` });
  project.pages.push(page);
  return { pageId: page.id, selection: [] };
};
export const updatePage: CommandHandler<"updatePage"> = ({ project, page, pageId }, command) => {
  ensure(
    Object.keys(command.patch).every((key) =>
      [
        "name",
        "width",
        "height",
        "background",
        "backgroundGradient",
        "effects",
        "margins",
        "rulers",
        "colorSpace",
        "guides",
        "canvasPosition",
        "spatial",
      ].includes(key),
    ),
    "INVALID_COMMAND",
    "Propriété de composition non modifiable",
  );
  const target =
    command.targetId === undefined ? page : project.pages.find((p) => p.id === command.targetId);
  ensure(target, "NOT_FOUND", "NOT_FOUND");
  Object.assign(target, command.patch);
  if (Object.hasOwn(command.patch, "spatial") || Object.hasOwn(command.patch, "effects"))
    pruneSceneMotionProperties(target);
  return { pageId };
};
export const deletePage: CommandHandler<"deletePage"> = ({ project, pageId }, command) => {
  ensure(
    project.pages.length > 1,
    "LAST_PAGE",
    "La dernière composition ne peut pas être supprimée",
  );
  ensure(
    project.pages.some((page) => page.id === command.id),
    "NOT_FOUND",
    "Composition introuvable",
  );
  const layout = arrangeArtboards(project.pages),
    byId = new Map(layout.boards.map((board) => [board.id, board])),
    removed = byId.get(command.id)!,
    removedIndex = project.pages.findIndex((page) => page.id === command.id),
    origin = layout.origin ?? { x: 0, y: 0 };
  const positions = new Map(
    layout.boards.map((board) => [
      board.id,
      {
        x: board.x + origin.x,
        y: board.y + origin.y,
      },
    ]),
  );
  // Preserve legacy shelf positions within the portable coordinate range. An
  // oversized legacy workspace must remain deletable even when migration cannot fit.
  const portable = [...positions.values()].every(
    (point) => Math.abs(point.x) <= 1_000_000 && Math.abs(point.y) <= 1_000_000,
  );
  project.pages = project.pages
    .filter((page) => page.id !== command.id)
    .map((page) =>
      page.canvasPosition || !portable
        ? page
        : { ...page, canvasPosition: positions.get(page.id)! },
    );
  if (command.id !== pageId) return { pageId };
  let nearest = project.pages[0]!,
    distance = Infinity,
    order = Infinity;
  for (const [index, page] of project.pages.entries()) {
    const board = byId.get(page.id)!,
      dx = board.x + board.width / 2 - removed.x - removed.width / 2,
      dy = board.y + board.height / 2 - removed.y - removed.height / 2,
      nextDistance = dx * dx + dy * dy,
      nextOrder = Math.abs((index >= removedIndex ? index + 1 : index) - removedIndex);
    if (nextDistance < distance || (nextDistance === distance && nextOrder < order)) {
      nearest = page;
      distance = nextDistance;
      order = nextOrder;
    }
  }
  return { pageId: nearest.id, selection: [] };
};
