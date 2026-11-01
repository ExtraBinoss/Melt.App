import { expect, test, vi } from "vitest";
import { createLayer, createPage, createProject, EditorEngine } from "@musart/core";
import * as selection from "../../../../src/components/layers/menu/selection";
import { SearchCommands } from "../../../../src/components/search/catalog/commands";
import { createSearchCommandItems } from "../../../../src/components/search/catalog/items";
import { bindingSnapshot } from "../../../../src/state/keybindings/preferences";

const t = (key: string) => key;

test("background/history reuse the selection projection and unaffected command items", () => {
  const engine = new EditorEngine(createProject()),
    cache = new SearchCommands(),
    bindings = bindingSnapshot(),
    analyze = vi.spyOn(selection, "layerSelection");
  const read = () => cache.read(engine.getSnapshot(), t, bindings, "en");
  const initial = read(),
    calls = analyze.mock.calls.length,
    item = (rows: ReturnType<typeof read>, id: string) => rows.find((row) => row.id === id)!;
  expect(calls).toBeGreaterThan(0);
  engine.execute({ type: "updatePage", patch: { background: "#123456" } });
  const edited = read();
  expect(item(edited, "action:undo").disabled).toBeUndefined();
  expect(item(edited, "action:save")).toBe(item(initial, "action:save"));
  expect(item(edited, "action:delete")).toBe(item(initial, "action:delete"));
  expect(analyze).toHaveBeenCalledTimes(calls);
  engine.undo();
  expect(item(read(), "action:redo").disabled).toBeUndefined();
  engine.redo();
  expect(read()).toBe(edited);
  expect(analyze).toHaveBeenCalledTimes(calls);
});

test("both command factories follow group roots, inherited locks and appearance-dependent ungroup eligibility", () => {
  const group = createLayer("group", { id: "group" }),
    child = createLayer("rectangle", { id: "child", parentId: group.id }),
    loose = createLayer("rectangle", { id: "loose" }),
    engine = new EditorEngine(
      createProject({ pages: [createPage({ layers: [group, child, loose] })] }),
    ),
    cache = new SearchCommands(),
    bindings = bindingSnapshot();
  function gates(id: string, allowed: boolean) {
    const snapshot = engine.getSnapshot();
    for (const rows of [
      cache.read(snapshot, t, bindings, "en"),
      createSearchCommandItems(snapshot, t, bindings),
    ]) {
      expect(rows.find((row) => row.id === `action:${id}`)?.disabled === undefined).toBe(allowed);
    }
  }
  engine.select([group.id, child.id]);
  gates("group", false);
  engine.select([child.id, loose.id]);
  gates("group", false);
  engine.select([group.id]);
  gates("ungroup", true);
  engine.execute({ type: "updateLayers", ids: [group.id], patch: { opacity: 0.5 } });
  gates("ungroup", false);
  engine.undo();
  gates("ungroup", true);
  engine.execute({ type: "updateLayers", ids: [group.id], patch: { locked: true } });
  engine.select([child.id, loose.id]);
  gates("group", false);
  expect(
    cache.read(engine.getSnapshot(), t, bindings, "en").find((row) => row.id === "effect:blur")
      ?.disabled,
  ).toBeDefined();
  engine.undo();
  engine.select([group.id, loose.id]);
  gates("group", true);
});
