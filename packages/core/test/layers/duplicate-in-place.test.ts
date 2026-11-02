import { expect, it } from "vitest";
import {
  EditorEngine,
  createLayer,
  createEffect,
  createPage,
  createProject,
  getWorldMatrix,
  type Command,
} from "../../src/index";
it("duplicates selected roots directly above their originals without offset and selects only the copies", () => {
  const layers = ["bottom", "text", "photo", "top"].map((id) =>
    createLayer(id === "text" ? "text" : "rectangle", {
      id,
      name: id,
      x: 21,
      y: 43,
      rotation: 17,
      scaleX: 1.2,
      affine: [-1, 0.2, 0.1, 1],
    }),
  );
  const engine = new EditorEngine(createProject({ pages: [createPage({ layers })] }));
  engine.select(["photo", "text"]);
  const before = engine.getSnapshot();
  engine.execute({
    type: "duplicateLayers",
    ids: ["photo", "text"],
    inPlace: true,
    nameSuffix: "copy",
  });
  const after = engine.getSnapshot(),
    page = after.project.pages[0]!;
  expect(page.layers.map((layer) => layer.name)).toEqual([
    "bottom",
    "text",
    "text copy",
    "photo",
    "photo copy",
    "top",
  ]);
  expect(after.selection).toEqual([page.layers[4]!.id, page.layers[2]!.id]);
  expect(getWorldMatrix(page, page.layers[2]!.id)).toEqual(getWorldMatrix(page, "text"));
  expect(getWorldMatrix(page, page.layers[4]!.id)).toEqual(getWorldMatrix(page, "photo"));
  engine.undo();
  expect(engine.getSnapshot().project).toEqual(before.project);
  engine.redo();
  expect(engine.getSnapshot().project).toEqual(after.project);
});
it("copies group identities, local transforms, mask references and motion keys without adding position offsets", () => {
  const group = createLayer("group", { id: "group", x: 35, y: 50, rotation: 20 });
  const mask = createLayer("rectangle", { id: "mask", parentId: "group", maskSource: true });
  const child = createLayer("rectangle", {
    id: "child",
    parentId: "group",
    x: 15,
    y: 27,
    effects: [createEffect("brightness", { id: "effect" })],
    mask: { layerId: "mask", enabled: true, inverted: false, mode: "luminance" },
  });
  const engine = new EditorEngine(
    createProject({ pages: [createPage({ layers: [group, mask, child] })] }),
  );
  engine.execute({ type: "setCompositionMode", mode: "motion" });
  engine.execute({
    type: "upsertMotionKeyframe",
    target: { kind: "layer", layerId: "group", property: "x" },
    time: { value: 0, rate: 1 },
    value: 74,
  });
  const before = engine.getSnapshot();
  engine.execute({ type: "duplicateLayers", ids: ["group", "child"], inPlace: true });
  const page = engine.getSnapshot().project.pages[0]!,
    duplicate = page.layers.find((layer) => layer.id === engine.getSnapshot().selection[0])!;
  const children = page.layers.filter((layer) => layer.parentId === duplicate.id),
    copyChild = children.find((layer) => layer.effects.length)!;
  expect(children).toHaveLength(2);
  expect(copyChild.mask!.layerId).toBe(children.find((layer) => layer.maskSource)!.id);
  expect(copyChild.effects[0]!.id).not.toBe("effect");
  expect(getWorldMatrix(page, copyChild.id)).toEqual(getWorldMatrix(page, "child"));
  const track = page.motion!.tracks.find((track) => track.layerId === duplicate.id)!;
  expect(
    track.properties.find(
      (property) => property.target.kind === "layer" && property.target.property === "x",
    )!.keyframes[0]!.value,
  ).toBe(74);
  engine.undo();
  expect(engine.getSnapshot().project).toEqual(before.project);
});
it("validates duplicate placement and naming before mutating the project", () => {
  const layer = createLayer("text", { id: "text" });
  const engine = new EditorEngine(createProject({ pages: [createPage({ layers: [layer] })] }));
  for (const patch of [{ inPlace: "yes" }, { nameSuffix: "" }, { nameSuffix: 2 }]) {
    const before = engine.getSnapshot();
    expect(() =>
      engine.execute({ type: "duplicateLayers", ids: [layer.id], ...patch } as Command),
    ).toThrow();
    expect(engine.getSnapshot()).toBe(before);
  }
});
