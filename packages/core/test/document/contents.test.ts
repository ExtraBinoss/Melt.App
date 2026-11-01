import { expect, test } from "vitest";
import { projectContentTags } from "../../src/document/contents";
import { createEffect, createLayer, createPage, createProject } from "../../src/document/factories";
import { createSpatialLayer } from "../../src/spatial/defaults";
import { EditorEngine } from "../../src/session/engine";

test("inventories actual content across pages, deduplicates effects and changes with edits", () => {
  const first = createLayer("text", { effects: [createEffect("blur"), createEffect("crt")] });
  const second = createLayer("video", { effects: [createEffect("blur")] });
  const project = createProject({
    pages: [createPage({ layers: [first] }), createPage({ layers: [second] })],
  });
  expect(projectContentTags(project)).toEqual([
    "effect:blur",
    "effect:crt",
    "layer:text",
    "layer:video",
  ]);
  const updated = { ...project, pages: [{ ...project.pages[0]!, layers: [createLayer("image")] }] };
  expect(projectContentTags(updated)).toEqual(["layer:image"]);
  expect(projectContentTags({ pages: [] })).toEqual(["feature:blank"]);
  expect(Object.isFrozen(projectContentTags(project))).toBe(true);
});

test("recognizes authored features without reading assets or history and drops them when removed", () => {
  const layer = createLayer("vector", {
    spatial: createSpatialLayer(),
    mask: { enabled: true, inverted: false },
    fillGradient: {
      kind: "linear",
      angle: 0,
      stops: [
        { offset: 0, color: "#000000" },
        { offset: 1, color: "#FFFFFF" },
      ],
    },
    effects: [{ ...createEffect("morph"), shapeMorph: { version: 1, shapes: [] } }],
  });
  const project = createProject({ pages: [createPage({ layers: [layer] })] });
  // Motion metadata uses the same initialization path as the editor.
  const engine = new EditorEngine(createProject());
  engine.execute({ type: "setCompositionMode", mode: "motion" });
  project.pages[0]!.motion = {
    ...engine.getSnapshot().project.pages[0]!.motion!,
    audioTracks: [
      {
        id: "audio",
        name: "Sound",
        assetId: "sound",
        start: { value: 0, rate: 1 },
        end: { value: 1, rate: 1 },
        sourceIn: { value: 0, rate: 1 },
        mute: false,
        volume: 1,
      },
    ],
  };
  for (const field of ["assets", "replay"])
    Object.defineProperty(project, field, {
      get: () => {
        throw new Error(`Must not read ${field}`);
      },
    });
  expect(projectContentTags(project)).toEqual([
    "effect:morph",
    "feature:3d",
    "feature:audio",
    "feature:gradients",
    "feature:masks",
    "feature:morph",
    "feature:motion",
    "layer:vector",
  ]);
  expect(
    projectContentTags({ pages: [createPage({ backgroundGradient: layer.fillGradient })] }),
  ).toEqual(["feature:gradients"]);
  expect(
    projectContentTags({
      pages: [createPage({ layers: [createLayer("ellipse", { maskSource: true })] })],
    }),
  ).toEqual(["feature:masks", "layer:ellipse"]);
  expect(projectContentTags({ pages: [createPage()] })).toEqual(["feature:blank"]);
});
