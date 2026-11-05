import { expect, test } from "vitest";
import { createEffect, createLayer, createPage, createProject } from "@musart/core";
import { projectLayerWorkspace } from "../../../../src/components/layers/tree/project";

test("projects every artboard as a stable root with independent collapsed children", () => {
  const first = createPage({ id: "first", layers: [createLayer("rectangle", { id: "shape" })] }),
    empty = createPage({ id: "empty" }),
    project = createProject({ pages: [first, empty] }),
    entries = projectLayerWorkspace(project, new Set(), new Set(), new Set());
  expect(entries.map((entry) => [entry.kind, entry.page.id])).toEqual([
    ["artboard", "first"],
    ["layer", "first"],
    ["artboard", "empty"],
    ["empty", "empty"],
  ]);
  expect(entries[1]).toMatchObject({ depth: 1 });
  expect(
    projectLayerWorkspace(project, new Set(["first"]), new Set(), new Set()).map(
      (entry) => entry.key,
    ),
  ).toEqual(["artboard:first", "artboard:empty", "empty:empty"]);
  expect(new Set(entries.map((entry) => entry.key)).size).toBe(entries.length);
});
test("a page-local drag changes only its own projected hierarchy", () => {
  const first = createPage({ id: "first", layers: [createLayer("rectangle", { id: "shape" })] }),
    group = createLayer("group", { id: "group" }),
    child = createLayer("text", { id: "text", parentId: group.id }),
    second = createPage({ id: "second", layers: [group, child] }),
    project = createProject({ pages: [first, second] }),
    entries = projectLayerWorkspace(project, new Set(), new Set([group.id]), new Set(), {
      pageId: second.id,
      layers: second.layers,
      inside: group.id,
    });
  expect(entries.find((entry) => entry.key === "layer:shape")).toMatchObject({
    page: first,
    depth: 1,
  });
  expect(entries.find((entry) => entry.key === "layer:text")).toMatchObject({
    page: second,
    depth: 2,
  });
  expect(first.layers[0]!.parentId).toBeNull();
});
test("large projects retain one flat virtualizable projection instead of per-artboard lists", () => {
  const pages = Array.from({ length: 2 }, (_, at) =>
      createPage({
        id: `page-${at}`,
        layers: Array.from({ length: 5000 }, (_, index) =>
          createLayer("rectangle", { id: `${at}:${index}` }),
        ),
      }),
    ),
    entries = projectLayerWorkspace(createProject({ pages }), new Set(), new Set(), new Set());
  expect(entries).toHaveLength(10002);
  expect(entries.filter((entry) => entry.kind === "artboard")).toHaveLength(2);
});

test("composition effects are virtual tree attachments with real IDs above artwork, never fabricated layers", () => {
  const effect = createEffect("grain", { id: "global-grain" });
  const page = createPage({ id: "canvas", effects: [effect], layers: [createLayer("rectangle")] });
  const project = createProject({ pages: [page] });
  const entries = projectLayerWorkspace(project, new Set(), new Set(), new Set());
  expect(entries.map((entry) => entry.kind)).toEqual([
    "artboard",
    "composition-effects",
    "composition-effect",
    "layer",
  ]);
  expect(entries[2]).toMatchObject({ page, effectId: effect.id });
  expect(entries[2]).not.toHaveProperty("layer");
  expect(
    projectLayerWorkspace(
      project,
      new Set(),
      new Set(),
      new Set(),
      undefined,
      new Set([page.id]),
    ).map((entry) => entry.kind),
  ).toEqual(["artboard", "composition-effects", "layer"]);
  expect(page.layers).toHaveLength(1);
});
