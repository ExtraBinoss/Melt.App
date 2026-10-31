import { expect, it } from "vitest";
import {
  createLayer,
  createPage,
  createProject,
  EditorEngine,
  type CommandCommitInfo,
} from "../../src/index";
it("publishes bounded frozen patch field names across transactions without copying heavy values", () => {
  const engine = new EditorEngine(
    createProject({
      pages: [
        createPage({
          layers: [
            createLayer("vector", {
              id: "svg",
              vector: { viewBox: "0 0 10 10", path: "M0 0L10 10H0Z" },
            }),
          ],
        }),
      ],
    }),
  );
  const events: CommandCommitInfo[] = [],
    stop = engine.subscribeCommitInfo((event) => events.push(event));
  engine.transaction([
    { type: "updateLayers", ids: ["svg"], patch: { x: 20, rotation: 45 } },
    { type: "updateLayerPatches", patches: [{ id: "svg", patch: { x: 30, fill: "#ff0000" } }] },
  ]);
  expect(events).toHaveLength(1);
  expect(events[0]!.layerFields).toEqual(["x", "rotation", "fill"]);
  expect(Object.isFrozen(events[0]!.layerFields)).toBe(true);
  expect(events[0]).not.toHaveProperty("commands");
  engine.undo();
  engine.redo();
  expect(events.slice(1).map((event) => [event.kind, event.layerFields])).toEqual([
    ["undo", undefined],
    ["redo", undefined],
  ]);
  stop();
});
