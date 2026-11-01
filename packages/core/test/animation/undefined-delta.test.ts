import { expect, test } from "vitest";
import { createEffect, createLayer, createPage, createProject } from "../../src/document/factories";
import { diffReplayState, applyReplayDelta } from "../../src/animation/delta";
import { stateFromProject } from "../../src/animation/state";
import { evaluateReplay } from "../../src/animation/evaluate";
import type { ReplaySpec } from "../../src/animation/model";

test("unchanged undefined optional properties do not produce repeated removal events", () => {
  const initial = stateFromProject(
    createProject({
      pages: [
        createPage({
          layers: [
            createLayer("rectangle", {
              effects: [createEffect("blur", { time: undefined, settings: undefined })],
              fillGradient: undefined,
            }),
          ],
        }),
      ],
    }),
  );
  const next = structuredClone(initial);
  next.pages[0]!.layers[0]!.x = 12;
  const delta = diffReplayState(initial, next);
  expect(delta).toEqual([{ op: "set", path: ["pages", 0, "layers", 0, "x"], value: 12 }]);
  const durable = JSON.parse(JSON.stringify(initial));
  expect(applyReplayDelta(durable, delta)).toEqual(JSON.parse(JSON.stringify(next)));
});

test("legacy repeated optional-field removals remain playable without accepting missing parents or array entries", () => {
  const initial = createProject({ pages: [createPage({ layers: [createLayer("rectangle")] })] });
  const spec: ReplaySpec = {
    version: 1,
    initial,
    pageId: initial.pages[0]!.id,
    duration: 300,
    assets: {},
    events: [100, 200].map((at, index) => ({
      projectId: initial.id,
      pageId: initial.pages[0]!.id,
      at,
      commands: [],
      delta: [
        { op: "remove", path: ["pages", 0, "layers", 0, "fillGradient"] },
        { op: "set", path: ["pages", 0, "layers", 0, "x"], value: 12 * (index + 1) },
      ],
    })),
  };
  expect(evaluateReplay(spec, 300).pages[0]!.layers[0]!.x).toBe(24);
  for (const delta of [
    [{ op: "remove" as const, path: ["pages", 0, "missing", "child"] }],
    [{ op: "remove" as const, path: ["pages", 0, "layers", 9] }],
    [{ op: "move" as const, from: ["missing"], path: ["assetIds", 0] }],
  ])
    expect(() =>
      applyReplayDelta(stateFromProject(initial), delta, { legacyObjectRemovals: true }),
    ).toThrow();
});
