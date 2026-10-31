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
        "margins",
        "rulers",
        "colorSpace",
        "guides",
        "canvasPosition",
      ].includes(key),
    ),
    "INVALID_COMMAND",
    "Propriété de composition non modifiable",
  );
  const target =
    command.targetId === undefined ? page : project.pages.find((p) => p.id === command.targetId);
  ensure(target, "NOT_FOUND", "NOT_FOUND");
  Object.assign(target, command.patch);
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
  project.pages = project.pages.filter((page) => page.id !== command.id);
  return { pageId: command.id === pageId ? project.pages[0]!.id : pageId, selection: [] };
};
