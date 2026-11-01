import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import {
  createEffect,
  createLayer,
  createPage,
  createProject,
  EditorEngine,
  morphContentBounds,
  type Project,
  type ShapeMorph,
} from "@musart/core";
import { canvasHit } from "../../../src/canvas/selection/hit";
import { boxSelection } from "../../../src/canvas/interaction/gestures";
import { createLiveMarquee } from "../../../src/canvas/selection/live-marquee";

const project = JSON.parse(
  readFileSync("apps/web/public/templates/motion/morphing-type/morphing-type.json", "utf8"),
).project as Project;

test("Melt's visible lettering is contained without enclosing its entire text frame, including its SVG neighbour", () => {
  const page = project.pages[0]!;
  const text = page.layers.find((layer) => layer.id === "melt-wordmark")!;
  const ink = morphContentBounds(text)!;
  expect(ink.width).toBeLessThan(text.width / 2);
  expect(ink.height).toBeLessThan(text.height / 2);
  const from = { x: text.x + ink.x - 2, y: text.y + ink.y - 2 };
  const to = { x: from.x + ink.width + 4, y: from.y + ink.height + 4 };
  expect(canvasHit(page, from)).toBeNull();
  expect(canvasHit(page, { x: from.x + 10, y: from.y + 10 })?.layer.id).toBe(text.id);
  expect(boxSelection(page, from, to)).toEqual([text.id]);
  expect(boxSelection(page, { x: 10, y: 370 }, { x: to.x, y: 710 })).toContain("melt-mascot-body");
  expect(boxSelection(page, { x: 10, y: 370 }, { x: to.x, y: 710 })).toContain(text.id);
  expect(boxSelection(page, from, { x: from.x + 8, y: from.y + 8 })).toEqual([]);
  expect(boxSelection(page, from, { x: from.x + 8, y: from.y + 8 }, "intersect")).toEqual([
    text.id,
  ]);
});

test("ink selection follows parent transforms, mirroring and visibility without changing resize geometry", () => {
  const original = project.pages[0]!.layers.find((layer) => layer.id === "melt-wordmark")!;
  const text = { ...original, x: 0, y: 0, scaleX: -1, scaleY: 0.5 };
  const group = createLayer("group", { id: "group", x: 200, y: 300, width: 2000, height: 1200 });
  const page = createPage({ layers: [group, { ...text, parentId: group.id }] });
  expect(canvasHit(page, { x: 200 + text.width / 2, y: 300 + text.height / 2 })?.layer.id).toBe(
    text.id,
  );
  expect(boxSelection(page, { x: 0, y: 0 }, { x: 2400, y: 1600 })).toContain(text.id);
  expect(
    boxSelection(
      { ...page, layers: [{ ...group, locked: true }, page.layers[1]!] },
      { x: 0, y: 0 },
      { x: 2400, y: 1600 },
    ),
  ).toEqual([]);
  expect(text.width).toBe(original.width);
});

test("live marquee uses the displayed Motion pose and rejects a different page", () => {
  const canonical = project.pages[0]!;
  const text = canonical.layers.find((layer) => layer.id === "melt-wordmark")!;
  const shifted = {
    ...canonical,
    layers: canonical.layers.map((layer) =>
      layer.id === text.id ? { ...layer, x: layer.x + 300 } : layer,
    ),
  };
  const engine = new EditorEngine(createProject({ pages: [canonical] }));
  const clock = { request: () => 1, cancel: () => {} };
  let displayed = shifted;
  const live = createLiveMarquee(engine, clock, () => displayed);
  const ink = morphContentBounds(text)!;
  const from = { x: text.x + ink.x + 298, y: text.y + ink.y - 2 };
  const to = { x: from.x + ink.width + 4, y: from.y + ink.height + 4 };
  const scope = { initial: [], additive: false, intersect: false };
  live.queue(from, to, scope);
  live.commit();
  expect(engine.getSnapshot().selection).toEqual([text.id]);
  displayed = { ...shifted, id: "other" };
  live.queue(from, to, scope);
  live.commit();
  expect(engine.getSnapshot().selection).toEqual([]);
});

test("source bounds mirror morph easing, amount and stagger, while changed source text falls back safely", () => {
  const shape: ShapeMorph = {
    version: 1,
    sourceText: "X",
    shapes: [
      {
        frames: [
          { at: 0, box: [0.1, 0.2, 0.2, 0.3], contours: [] },
          { at: 1, box: [0.5, 0.6, 0.4, 0.2], contours: [], easing: "easeOut" },
        ],
      },
    ],
  };
  const effect = {
    ...createEffect("morph"),
    amount: 0.5,
    shapeMorph: shape,
    settings: { progress: 0.5, stagger: 0 },
  };
  const text = createLayer("text", { text: "X", width: 100, height: 100, effects: [effect] });
  expect(morphContentBounds(text)).toEqual({
    x: expect.closeTo(27.5),
    y: 37.5,
    width: expect.closeTo(28.75),
    height: 25.625,
  });
  expect(morphContentBounds(text)).toBe(morphContentBounds(text));
  expect(morphContentBounds({ ...text, text: "changed" })).toBeNull();
  expect(morphContentBounds({ ...text, effects: [{ ...effect, enabled: false }] })).toBeNull();
});
