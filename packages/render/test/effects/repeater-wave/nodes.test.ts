import { expect, test } from "vitest";
import { repeaterNode } from "../../../src/effects/repeater/node";
import { waveDistortionNode } from "../../../src/effects/wave-distortion/node";
import { graphNodes, nodeFixture } from "../node-fixture";

for (const [type, builder, keys] of [
  [
    "repeater",
    repeaterNode,
    [
      "layout",
      "count",
      "columns",
      "spacingX",
      "spacingY",
      "radius",
      "angle",
      "scaleStep",
      "rotationStep",
      "copyOpacity",
    ],
  ],
  [
    "wave-distortion",
    waveDistortionNode,
    ["waveform", "amplitude", "frequency", "angle", "phase", "edge"],
  ],
] as const) {
  test(`${type} samples alpha safely in the stable authored domain with retained controls`, () => {
    const fixture = nodeFixture(type),
      node = builder(fixture),
      key = node.getCacheKey(),
      graph = graphNodes(node);
    for (const name of keys) expect(graph.has(fixture.controls.parameters[name]!)).toBe(true);
    for (const binding of [
      fixture.controls.amount,
      fixture.controls.logicalResolution,
      fixture.controls.contentOrigin,
      fixture.controls.contentResolution,
      fixture.controls.sourceFlipY,
      fixture.controls.resolution,
    ])
      expect(graph.has(binding)).toBe(true);
    expect(graph.has(fixture.controls.time)).toBe(false);
    fixture.controls.parameters.angle!.value = 90;
    fixture.controls.sourceFlipY.value = 1;
    fixture.controls.contentOrigin.value.set(37, 91);
    fixture.controls.contentResolution.value.set(480, 320);
    expect(node.getCacheKey()).toBe(key);
    expect(fixture.getGlyphAtlas).not.toHaveBeenCalled();
    fixture.dispose();
  });
}
