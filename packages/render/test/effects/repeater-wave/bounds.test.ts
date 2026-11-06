import { effectFootprint } from "../../../src/effects/shared/footprint";
import { expect, test } from "vitest";
import { createEffect } from "@musart/core";
import { repeaterFootprint } from "../../../src/effects/repeater/footprint";
import { waveDistortionFootprint } from "../../../src/effects/wave-distortion/footprint";

const owner = { width: 100, height: 40 };
test("repeater admits translated, grid and radial copies beyond the source owner", () => {
  const effect = createEffect("repeater", { settings: { count: 4, scaleStep: 0 } });
  expect(repeaterFootprint(effect, owner)).toEqual({ left: 0, top: 0, right: 301, bottom: 0 });
  expect(
    repeaterFootprint(
      {
        ...effect,
        settings: { ...effect.settings, layout: "grid", columns: 2, spacingX: 100, spacingY: 60 },
      },
      owner,
    ),
  ).toEqual({ left: 0, top: 0, right: 101, bottom: 61 });
  expect(
    repeaterFootprint(
      { ...effect, settings: { ...effect.settings, layout: "radial", count: 5, radius: 200 } },
      owner,
    ),
  ).toEqual({ left: 201, top: 201, right: 201, bottom: 201 });
});

test("repeater bounds use authored dimensions and transform earlier expanded paint", () => {
  const effect = createEffect("repeater", {
    settings: { count: 2, spacingX: 0, rotationStep: 90, scaleStep: 0 },
  });
  expect(repeaterFootprint(effect, owner)).toEqual({ left: 0, top: 31, right: 0, bottom: 31 });
  expect(repeaterFootprint(effect, owner, { left: 20, top: 0, right: 0, bottom: 0 })).toEqual({
    left: 0,
    top: 51,
    right: 0,
    bottom: 31,
  });
  expect(
    repeaterFootprint(
      { ...effect, settings: { ...effect.settings, rotationStep: 0, scaleStep: 0.25 } },
      owner,
    ),
  ).toEqual({ left: 14, top: 6, right: 14, bottom: 6 });
});

test("repeater preserves stable amount-animation bounds and omits invisible copies", () => {
  const effect = createEffect("repeater");
  expect(repeaterFootprint({ ...effect, amount: 0 }, owner)).toEqual(
    repeaterFootprint(effect, owner),
  );
  for (const settings of [{ count: 1 }, { copyOpacity: 0 }])
    expect(repeaterFootprint({ ...effect, settings }, owner)).toEqual({
      left: 0,
      top: 0,
      right: 0,
      bottom: 0,
    });
});

test("wave displacement reserves perpendicular authored-pixel amplitude independently of phase", () => {
  const effect = createEffect("wave-distortion", { settings: { amplitude: 24, angle: 0 } });
  expect(waveDistortionFootprint(effect)).toEqual({ left: 0, top: 25, right: 0, bottom: 25 });
  expect(waveDistortionFootprint({ ...effect, settings: { amplitude: 24, angle: 90 } })).toEqual({
    left: 25,
    top: 0,
    right: 25,
    bottom: 0,
  });
  expect(
    waveDistortionFootprint({
      ...effect,
      amount: 0,
      settings: { ...effect.settings, phase: 137, frequency: 64 },
    }),
  ).toEqual(waveDistortionFootprint(effect));
  expect(waveDistortionFootprint({ ...effect, settings: { amplitude: 0 } })).toEqual({
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
  });
});

test("stack admission passes the owner size and preceding convolution margins to Repeater", () => {
  const blur = createEffect("blur", { scale: 10 });
  const repeater = createEffect("repeater", {
    settings: { count: 2, spacingX: 0, rotationStep: 90, scaleStep: 0 },
  });
  const before = effectFootprint([blur], owner);
  const incremental = repeaterFootprint(repeater, owner, before);
  expect(effectFootprint([blur, repeater], owner)).toEqual({
    left: before.left + incremental.left,
    right: before.right + incremental.right,
    top: before.top + incremental.top,
    bottom: before.bottom + incremental.bottom,
  });
  expect(() => effectFootprint([repeater])).toThrow("authored owner dimensions");
});
