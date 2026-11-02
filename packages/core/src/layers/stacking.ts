import { ensure } from "../errors";
import { assertEditable, selectedRoots } from "./access";
import type { CommandHandler } from "../session/context";
/** Move selected sibling blocks one step, retaining each block's internal order and hierarchy. */
export const shiftLayers: CommandHandler<"shiftLayers"> = ({ page, pageId }, command) => {
  ensure(
    command.direction === "forward" || command.direction === "backward",
    "INVALID_COMMAND",
    "Invalid stacking direction.",
  );
  const roots = selectedRoots(page, command.ids),
    selected = new Set(roots.map((layer) => layer.id));
  for (const layer of roots) assertEditable(page, layer);
  const parents = new Set(roots.map((layer) => layer.parentId));
  for (const parent of parents) {
    const positions = page.layers.flatMap((layer, index) =>
      layer.parentId === parent ? [index] : [],
    );
    const siblings = positions.map((index) => page.layers[index]!);
    if (command.direction === "forward") {
      for (let i = siblings.length - 2; i >= 0; i--)
        if (selected.has(siblings[i]!.id) && !selected.has(siblings[i + 1]!.id))
          [siblings[i], siblings[i + 1]] = [siblings[i + 1]!, siblings[i]!];
    } else
      for (let i = 1; i < siblings.length; i++)
        if (selected.has(siblings[i]!.id) && !selected.has(siblings[i - 1]!.id))
          [siblings[i], siblings[i - 1]] = [siblings[i - 1]!, siblings[i]!];
    positions.forEach((position, index) => {
      page.layers[position] = siblings[index]!;
    });
  }
  return { pageId };
};
/** Clipping is independent from editable masks and never hides its base layer. */
export const toggleClipping: CommandHandler<"toggleClipping"> = ({ page, pageId }, command) => {
  const roots = selectedRoots(page, command.ids);
  ensure(roots.length > 0, "INVALID_COMMAND", "Select a layer for clipping.");
  for (const layer of roots) assertEditable(page, layer);
  if (roots.every((layer) => layer.clipping)) {
    for (const layer of roots) delete layer.clipping;
  } else {
    const selected = new Set(roots.map((layer) => layer.id));
    for (const layer of roots) {
      if (layer.clipping) continue;
      const siblings = page.layers.filter(
        (item) => item.parentId === layer.parentId && !item.maskSource,
      );
      let index = siblings.findIndex((item) => item.id === layer.id) - 1;
      while (index >= 0 && selected.has(siblings[index]!.id)) index--;
      const previous = siblings[index];
      ensure(previous, "INVALID_COMMAND", "A clipping layer needs a layer below it.");
      const base = previous.clipping?.layerId ?? previous.id;
      layer.clipping = { layerId: base };
    }
  }
  return { pageId };
};
