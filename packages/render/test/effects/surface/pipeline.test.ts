import { expect, test } from "vitest";
import { createEffect } from "@musart/core";
import { effectStages } from "../../../src/effects/pipeline";
import { effectFootprint } from "../../../src/effects/shared/footprint";
test("bounds all Pixel Sort networks, retains one final compositor and reuses compiled stage identities", () => {
  for (const [window, passes] of [
    ["8", 7],
    ["16", 11],
    ["32", 16],
    ["64", 22],
  ] as const) {
    const effect = createEffect("pixel-sort", { settings: { window } });
    const stages = effectStages(effect);
    expect(stages).toHaveLength(passes);
    expect(stages.filter((s) => s.final)).toHaveLength(1);
    expect(new Set(stages.map((s) => s.key)).size).toBe(passes);
    expect(effectStages(effect)).toBe(stages);
  }
  expect(() =>
    effectStages(createEffect("pixel-sort", { settings: { window: "2048" } })),
  ).toThrow();
});
test("allocates conservative ink outsets independently of amount and skips disabled bleed", () => {
  const effect = createEffect("ink-bleed", { settings: { radius: 8.5 } });
  expect(effectFootprint([effect])).toEqual({ left: 10, right: 10, top: 10, bottom: 10 });
  expect(effectFootprint([{ ...effect, amount: 0 }])).toEqual(effectFootprint([effect]));
  expect(effectFootprint([{ ...effect, enabled: false }])).toEqual({
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  });
  expect(effectStages(createEffect("edge-detect"))).toHaveLength(3);
});
