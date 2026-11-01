import { expect, it } from "vitest";
import {
  createEffect,
  createLayer,
  createPage,
  createProject,
  EditorEngine,
  type HistoryDescription,
  type ImageAsset,
} from "@musart/core";
import { assignEffectImage } from "../../../src/services/textures/library";
import { formatHistoryDescription } from "../../../src/components/notifications/history/presentation";
import { i18n } from "../../../src/state/i18n";
import "../../../src/components/properties/effects/library-messages";
import "../../../src/components/notifications/history/messages";
const asset: ImageAsset = {
  id: "texture-original",
  name: "map.png",
  width: 1,
  height: 1,
  mime: "image/png",
  dataUrl:
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j9WQAAAAASUVORK5CYII=",
};
const make = () =>
  new EditorEngine(
    createProject({
      pages: [
        createPage({
          layers: [
            createLayer("rectangle", {
              id: "item",
              effects: [createEffect("displace", { id: "fx" })],
            }),
          ],
        }),
      ],
    }),
  );
it("embeds the map and input atomically, labels history and restores both on undo/redo", () => {
  const engine = make(),
    before = engine.getSnapshot();
  let notice: HistoryDescription | undefined;
  engine.subscribeCommitInfo((event) => {
    notice = event.history;
  });
  assignEffectImage(engine, before, "item", "fx", "map", asset);
  const assigned = engine.getSnapshot();
  expect(assigned.revision).toBe(before.revision + 1);
  expect(assigned.project.assets[asset.id]).toEqual(asset);
  expect(assigned.project.pages[0]!.layers[0]!.effects[0]!.inputs).toEqual({ map: asset.id });
  engine.undo();
  expect(engine.getSnapshot().project).toEqual(before.project);
  engine.redo();
  expect(engine.getSnapshot().project).toEqual(assigned.project);
  const label = formatHistoryDescription(notice, "redo", i18n.getFixedT("en", "historyNotice"));
  expect(label).toContain("Displacement map");
  expect(label).not.toContain(asset.id);
  assignEffectImage(engine, engine.getSnapshot(), "item", "fx", "map");
  expect(engine.getSnapshot().project.assets[asset.id]).toEqual(asset);
  expect(engine.getSnapshot().project.pages[0]!.layers[0]!.effects[0]!.inputs).toEqual({});
});
it("rejects a stale import or invalid slot without mutating the current project", () => {
  const engine = make(),
    before = engine.getSnapshot();
  engine.execute({ type: "updateLayers", ids: ["item"], patch: { fill: "#ffffff" } });
  const current = engine.getSnapshot();
  expect(() => assignEffectImage(engine, before, "item", "fx", "map", asset)).toThrow("stale");
  expect(() => assignEffectImage(engine, current, "item", "fx", "unknown", asset)).toThrow();
  expect(engine.getSnapshot().project).toBe(current.project);
});
