import { expect, it } from "vitest";
import { createProject, EditorEngine } from "@musart/core";
import { createQuickAddItems } from "../../../src/canvas/quick-add/catalog";
import { createSearchCommandItems } from "../../../src/components/search/catalog/items";
import { isCommandId } from "../../../src/state/keybindings/registry";
it("uses every shared registered command, with insertion first and real availability retained", () => {
  const snapshot = new EditorEngine(createProject()).getSnapshot(),
    t = (key: string) => key;
  const items = createQuickAddItems(snapshot, t),
    registry = createSearchCommandItems(snapshot, t);
  expect(items.slice(0, 7).map((item) => item.id)).toEqual([
    "action:toolShape",
    "action:toolText",
    "action:toolRectangle",
    "action:toolEllipse",
    "action:importImages",
    "action:importSvg",
    "action:addPage",
  ]);
  expect(items.map((item) => item.id).sort()).toEqual(
    registry
      .filter((item) => isCommandId(item.id))
      .map((item) => item.id)
      .sort(),
  );
  expect(items.find((item) => item.id === "effect:blur")?.disabled).toBe("search:noSelection");
  for (const item of items) expect(item).toEqual(registry.find((entry) => entry.id === item.id));
});
