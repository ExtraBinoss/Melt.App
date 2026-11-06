import type { CommandHandler } from "../session/context";
import { ensure } from "../errors";
import { colorOwner, colorTargets, replaceColorLinks, writeTargetColor } from "./targets";
import { validateDocumentColor } from "./validation";
export const setDocumentColors: CommandHandler<"setDocumentColors"> = (
  { project, pageId },
  command,
) => {
  ensure(
    Array.isArray(command.colors) && command.colors.length <= 256,
    "INVALID_COMMAND",
    "Too many document colors",
  );
  const ids = new Set<string>();
  for (const color of command.colors) validateDocumentColor(color, ids);
  const updated = new Map(command.colors.map((color) => [color.id, color]));
  const colors = new Map((project.colors ?? []).map((color) => [color.id, color]));
  for (const color of command.colors) colors.set(color.id, color);
  project.colors = [...colors.values()];
  for (const { owner, target, colorId } of colorTargets(project)) {
    const color = updated.get(colorId);
    if (color) writeTargetColor(owner, target.property, color.value);
  }
  return { pageId };
};
export const deleteDocumentColor: CommandHandler<"deleteDocumentColor"> = (
  { project, pageId },
  command,
) => {
  ensure(
    project.colors?.some((color) => color.id === command.id),
    "NOT_FOUND",
    "Document color is missing",
  );
  project.colors = project.colors!.filter((color) => color.id !== command.id);
  for (const { owner, target, colorId } of colorTargets(project))
    if (colorId === command.id) {
      const links = { ...owner.colorLinks };
      delete links[target.property];
      replaceColorLinks(owner, links);
    }
  return { pageId };
};
export const linkDocumentColor: CommandHandler<"linkDocumentColor"> = (
  { project, pageId },
  command,
) => {
  ensure(
    Array.isArray(command.targets) && command.targets.length > 0 && command.targets.length <= 10000,
    "INVALID_COMMAND",
    "Invalid color targets",
  );
  const color = project.colors?.find((item) => item.id === command.colorId);
  ensure(command.colorId === null || color, "NOT_FOUND", "Document color is missing");
  for (const target of command.targets) {
    const owner = colorOwner(project, target),
      links = { ...owner.colorLinks };
    if (color) {
      links[target.property] = color.id;
      writeTargetColor(owner, target.property, color.value);
    } else delete links[target.property];
    replaceColorLinks(owner, links);
  }
  return { pageId };
};
