import { expect, test } from "vitest";
import { featherNode } from "../../../src/effects/feather/node";
import { graphNodes, nodeFixture } from "../node-fixture";
test("feather is an ordinary GPU alpha treatment with stable independently editable uniforms", () => {
  const fixture = nodeFixture("feather"),
    node = featherNode(fixture),
    key = node.getCacheKey();
  const graph = graphNodes(node);
  for (const name of ["centerX", "centerY", "radius", "softness"])
    expect(graph.has(fixture.controls.parameters[name]!)).toBe(true);
  expect(graph.has(fixture.controls.amount)).toBe(true);
  fixture.controls.parameters.radius!.value = 0.8;
  fixture.controls.parameters.softness!.value = 0.4;
  expect(node.getCacheKey()).toBe(key);
  fixture.dispose();
});
