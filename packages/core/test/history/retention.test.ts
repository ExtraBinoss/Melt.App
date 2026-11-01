import { expect, it } from "vitest";
import { createProject, type CommandCommitInfo } from "../../src/index";
import { fixture, scalar } from "./support";
it("serves descriptions to late observers, obeys a custom history limit, branches and clears on load", () => {
  const d = fixture(undefined, 2);
  for (const opacity of [0.1, 0.2, 0.3])
    d.engine.execute({ type: "updateLayers", ids: ["item"], patch: { opacity } });
  const late: CommandCommitInfo[] = [];
  const stop = d.engine.subscribeCommitInfo((event) => late.push(event));
  d.engine.select(["item"]);
  d.engine.undo();
  d.engine.undo();
  d.engine.undo();
  expect(late).toHaveLength(2);
  expect(late[0]!.history!.changes[0]).toMatchObject({ before: scalar(0.2), after: scalar(0.3) });
  expect(d.engine.getSnapshot().canUndo).toBe(false);
  d.engine.redo();
  expect(late.at(-1)!.history).toBe(late[1]!.history);
  d.engine.execute({ type: "renameProject", name: "New branch" });
  const count = late.length;
  d.engine.redo();
  expect(late).toHaveLength(count);
  d.engine.undo();
  expect(late.at(-1)!.history!.changes[0]).toMatchObject({
    target: { owner: { kind: "project" }, property: "name" },
  });
  d.engine.load(createProject());
  expect(late.at(-1)).not.toHaveProperty("history");
  expect(d.engine.getSnapshot().canUndo).toBe(false);
  expect(d.engine.getSnapshot().canRedo).toBe(false);
  stop();
});
