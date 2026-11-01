import { expect, it } from "vitest";
import { createEffect, createLayer, type Layer } from "@musart/core";
import {
  isInstancedPrimitive,
  primitivePaintKey,
} from "../../../src/compositing/primitives/eligibility";
it("keeps effect/mask/blend/group/gradient cases on their isolated exact path", () => {
  const base = createLayer("rectangle");
  expect(isInstancedPrimitive(base)).toBe(true);
  expect(
    isInstancedPrimitive(
      createLayer("ellipse", { effects: [createEffect("dither", { enabled: false })] }),
    ),
  ).toBe(true);
  const ineligible: Layer[] = [
    createLayer("text"),
    createLayer("group"),
    { ...base, blendMode: "multiply" as const },
    { ...base, maskSource: true },
    { ...base, effects: [createEffect("dither")] },
    { ...base, mask: { enabled: true, assetId: "asset", inverted: false } },
    {
      ...base,
      fillGradient: {
        kind: "linear",
        angle: 0,
        stops: [
          { offset: 0, color: "#000000" },
          { offset: 1, color: "#ffffff" },
        ],
      },
    },
  ];
  for (const layer of ineligible) expect(isInstancedPrimitive(layer)).toBe(false);
  const key = primitivePaintKey(base);
  expect(primitivePaintKey({ ...base, name: "renamed", locked: true })).toEqual(key);
  expect(primitivePaintKey({ ...base, fill: "#ff0000" })).not.toEqual(key);
});

it("retains the exact primitive path at declared identity amounts without bypassing explicit compositing", () => {
  const base = createLayer("ellipse");
  for (const type of ["bevel", "displace", "thermal"] as const) {
    const effect = createEffect(type, { amount: 0 });
    expect(isInstancedPrimitive({ ...base, effects: [effect] })).toBe(true);
    expect(isInstancedPrimitive({ ...base, effects: [{ ...effect, composite: "clear" }] })).toBe(
      false,
    );
    expect(isInstancedPrimitive({ ...base, effects: [{ ...effect, blendMode: "multiply" }] })).toBe(
      false,
    );
  }
  expect(
    isInstancedPrimitive({ ...base, effects: [createEffect("brightness", { amount: 0 })] }),
  ).toBe(false);
});
