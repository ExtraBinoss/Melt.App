import { describe, expect, it } from "vitest";
import { createEffect } from "@musart/core";
import { ditherNode } from "../../../src/effects/dither/node";
import { updateEffectUniforms } from "../../../src/effects/shared/uniforms";
import { expectSourceAlpha, nodeFixture } from "../node-fixture";

describe("dither node", () => {
  it("retains source alpha and uniform identities while changing every shared method and palette", () => {
    const fixture = nodeFixture("dither"),
      node = ditherNode(fixture);
    const key = node.getCacheKey(),
      method = fixture.controls.parameters.method;
    const foreground = fixture.controls.colors.foreground;
    expectSourceAlpha(node, fixture.input);
    for (const [index, name] of [
      "multilevel",
      "threshold",
      "bayer2",
      "bayer4",
      "bayer8",
      "interleaved",
    ].entries()) {
      updateEffectUniforms(
        fixture.controls,
        createEffect("dither", {
          amount: 0.35,
          color: index % 2 === 1,
          settings: { method: name, foreground: "#ff0088", contrast: 1.5 },
        }),
        128,
        96,
      );
      expect(node.getCacheKey()).toBe(key);
      expect(fixture.controls.parameters.method).toBe(method);
      expect(method!.value).toBe(index);
      expect(fixture.controls.colors.foreground).toBe(foreground);
      expect(fixture.controls.parameters.contrast!.value).toBe(1.5);
      expect(fixture.controls.color.value).toBe(index % 2);
      expect(fixture.controls.amount.value).toBe(0.35);
    }
    expect(fixture.getGlyphAtlas).not.toHaveBeenCalled();
    fixture.dispose();
  });
});
