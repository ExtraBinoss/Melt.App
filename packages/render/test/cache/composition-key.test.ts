import { expect, it } from "vitest";
import { createPage, createLayer, createEffect } from "@musart/core";
import { compositionPaintKey } from "../../src/cache/composition-key";
it("invalidates root pixels for gradient edits but preserves editing-only metadata and solid state", () => {
  const root = createLayer("rectangle"),
    page = createPage(),
    source = () => "source";
  const plain = compositionPaintKey(page, [root], source);
  expect(compositionPaintKey({ ...page, name: "Renamed", rulers: true }, [root], source)).toBe(
    plain,
  );
  const gradient = {
    kind: "linear" as const,
    angle: 0,
    stops: [
      { offset: 0, color: "#ff0000" },
      { offset: 1, color: "#0000ff" },
    ],
  };
  const painted = compositionPaintKey({ ...page, backgroundGradient: gradient }, [root], source);
  expect(painted).not.toBe(plain);
  expect(
    compositionPaintKey(
      { ...page, backgroundGradient: { ...gradient, angle: 90 } },
      [root],
      source,
    ),
  ).not.toBe(painted);
  expect(compositionPaintKey({ ...page, backgroundGradient: undefined }, [root], source)).toBe(
    plain,
  );
});
it("invalidates global effects and their input originals without confusing legacy empty stacks", () => {
  const page = createPage();
  const key = (value = page, input = "original") =>
    compositionPaintKey(
      value,
      [],
      () => "",
      () => input,
    );
  expect(key({ ...page, effects: undefined })).toBe(key());
  const effects = [createEffect("displace", { inputs: { map: "map" } })];
  expect(key({ ...page, effects })).not.toBe(key());
  expect(key({ ...page, effects }, "replacement")).not.toBe(key({ ...page, effects }));
});
