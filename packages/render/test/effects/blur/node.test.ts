import { expect, it } from "vitest";
import { createEffect } from "@musart/core";
import { effectFootprint } from "../../../src/effects/shared/footprint";
import { effectStages } from "../../../src/effects/pipeline";
import { updateEffectUniforms } from "../../../src/effects/shared/uniforms";
import { BLUR_TECHNIQUES } from "../../../../core/src/effects/blur/definition";
import { nodeFixture } from "../node-fixture";
import { LoopNode, NodeBuilder, Texture, TextureNode, type Node } from "three/webgpu";
import { texture } from "three/tsl";

class BlurGraphBuilder extends NodeBuilder {}
/** Loop bodies are deferred by TSL, so expand them with the same builder as their Fn calls. */
function blurGraph(node: Node): Set<Node> {
  const builder = new BlurGraphBuilder(),
    nodes = new Set<Node>(),
    pending = [node];
  while (pending.length) {
    const current = pending.pop()!;
    if (nodes.has(current)) continue;
    nodes.add(current);
    pending.push(...current.getChildren());
    if (current instanceof LoopNode) {
      const properties = current.getProperties(builder) as {
        returnsNode: Node;
        stackNode: Node;
        updateNode?: Node;
      };
      pending.push(properties.returnsNode, properties.stackNode);
      if (properties.updateNode) pending.push(properties.updateNode);
    }
    const call = current as Node & {
      isShaderCallNodeInternal?: boolean;
      getOutputNode?: (builder: NodeBuilder) => Node;
    };
    if (call.isShaderCallNodeInternal && call.getOutputNode)
      pending.push(call.getOutputNode(builder));
  }
  return nodes;
}
it("softens RGBA on two axes while keeping admitted bounds stable across amount animation", () => {
  const fixture = nodeFixture("blur");
  const radius = fixture.controls.scale,
    amount = fixture.controls.amount;
  for (const value of [0, 0.5, 1]) {
    const effect = createEffect("blur", { amount: value, scale: 20 });
    updateEffectUniforms(fixture.controls, effect, 320, 240);
    expect(fixture.controls.scale).toBe(radius);
    expect(fixture.controls.amount).toBe(amount);
    expect(radius.value * amount.value).toBe(20 * value);
    expect(effectFootprint([effect])).toEqual({ left: 65, top: 65, right: 65, bottom: 65 });
    expect(effectStages(effect).map((stage) => stage.final)).toEqual([false, true]);
  }
  expect(effectFootprint([createEffect("blur", { enabled: false })])).toEqual({
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
  });
  fixture.dispose();
});

it("uses distinct bounded algorithm graphs and the preserved original for final protection", () => {
  const fixture = nodeFixture("blur"),
    original = new Texture();
  const keys = new Set<string>();
  for (const technique of BLUR_TECHNIQUES) {
    const effect = createEffect("blur", { settings: { technique, protect: true } });
    const stages = effectStages(effect);
    expect(stages.length).toBe(
      technique === "progressive" ? 4 : technique === "gaussian" || technique === "box" ? 2 : 1,
    );
    expect(stages.at(-1)!.final).toBe(true);
    expect(keys.has(stages.at(-1)!.key)).toBe(false);
    keys.add(stages.at(-1)!.key);
    const context = { ...fixture, backdrop: texture(original) };
    const graph = blurGraph(stages.at(-1)!.builder(context));
    const textures = [...graph].filter((node): node is TextureNode => node instanceof TextureNode);
    expect(
      textures.some((node) => node.value === fixture.input),
      `${technique} treatment input`,
    ).toBe(true);
    expect(
      textures.some((node) => node.value === original),
      `${technique} untouched backdrop`,
    ).toBe(true);
  }
  original.dispose();
  fixture.dispose();
});

it("updates technique settings without replacing uniforms or changing animated bounds", () => {
  const fixture = nodeFixture("blur");
  const fields = { ...fixture.controls.parameters };
  for (const technique of BLUR_TECHNIQUES) {
    const effect = createEffect("blur", {
      amount: 0.25,
      scale: 20,
      settings: {
        technique,
        protect: true,
        centerX: 0,
        feather: 0,
        apertureBlades: 3,
        rangeSigma: 0.01,
      },
    });
    updateEffectUniforms(fixture.controls, effect, 320, 240, {
      width: 320,
      height: 240,
      content: { x: 20, y: 10, width: 280, height: 200 },
    });
    for (const [key, field] of Object.entries(fields))
      expect(fixture.controls.parameters[key]).toBe(field);
    expect(fields.technique!.value).toBe(BLUR_TECHNIQUES.indexOf(technique));
    expect(fields.protect!.value).toBe(1);
    expect(fields.centerX!.value).toBe(0);
    expect(fields.feather!.value).toBe(0);
    expect(fixture.controls.contentOrigin.value.toArray()).toEqual([20, 30]);
    expect(effectFootprint([effect])).toEqual({ left: 65, top: 65, right: 65, bottom: 65 });
  }
  expect(() =>
    effectStages(createEffect("blur", { settings: { technique: "__proto__" } })),
  ).toThrow("Unknown blur technique");
  fixture.dispose();
});
