import { expect, it } from "vitest";
import {
  createPage,
  createProject,
  createLayer,
  EditorEngine,
  parseProject,
  serializeProject,
  selectionComposition,
} from "../../src/index";
const paint = {
  kind: "linear" as const,
  angle: 35,
  stops: [
    { offset: 0, color: "#8757ff" },
    { offset: 1, color: "#ffcc99" },
  ],
};
it("validates, persists and restores background paint with named atomic history", () => {
  const engine = new EditorEngine(
    createProject({ pages: [createPage({ background: "#123456" })] }),
  );
  const original = engine.getSnapshot().project;
  const commits: import("../../src/index").CommandCommitInfo[] = [];
  engine.subscribeCommitInfo((event) => commits.push(event));
  engine.execute({ type: "updatePage", patch: { backgroundGradient: paint } });
  const changed = engine.getSnapshot().project;
  expect(commits.at(-1)!.history!.changes).toContainEqual(
    expect.objectContaining({
      kind: "property",
      target: {
        owner: { kind: "composition", compositionId: changed.pages[0]!.id },
        property: "backgroundGradient.stops.0.color",
      },
      after: { kind: "scalar", value: "#8757ff" },
    }),
  );
  expect(parseProject(serializeProject(changed)).pages[0]!.backgroundGradient).toEqual(paint);
  expect(changed.pages[0]!.background).toBe("#123456");
  engine.undo();
  expect(engine.getSnapshot().project).toEqual(original);
  engine.redo();
  expect(engine.getSnapshot().project).toEqual(changed);
  expect(() =>
    engine.execute({
      type: "updatePage",
      patch: {
        backgroundGradient: {
          ...paint,
          stops: [
            { offset: 0, color: "invalid" },
            { offset: 1, color: "#ffffff" },
          ],
        },
      },
    }),
  ).toThrow();
  expect(engine.getSnapshot().project).toBe(changed);
  engine.execute({ type: "updatePage", patch: { backgroundGradient: undefined } });
  expect(engine.getSnapshot().project.pages[0]!.backgroundGradient).toBeUndefined();
  engine.undo();
  expect(engine.getSnapshot().project.pages[0]!.backgroundGradient).toEqual(paint);
});
it("omits artboard gradients from isolated layer exports", () => {
  const page = createPage({
    backgroundGradient: paint,
    layers: [createLayer("rectangle", { id: "shape" })],
  });
  const isolated = selectionComposition(page, ["shape"]);
  expect(isolated.backgroundGradient).toBeUndefined();
  expect(isolated.background).toBe("transparent");
});
