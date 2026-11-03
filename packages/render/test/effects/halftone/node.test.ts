import { expect, it } from "vitest";
import { AssignNode, JoinNode, VarNode, type Node } from "three/webgpu";
import { halftoneNode } from "../../../src/effects/halftone/node";
import { expectSourceAlpha, nodeFixture, graphNodes } from "../node-fixture";
it("preserves legacy source alpha and keeps transparent-paper controls as stable GPU uniforms", () => {
  const fixture = nodeFixture("halftone");
  const node = halftoneNode(fixture);
  const graph = graphNodes(node);
  const legacy = [...graph].filter((entry): entry is AssignNode & { sourceNode: Node } => {
    if (!(entry instanceof AssignNode) || !("sourceNode" in entry)) return false;
    const source = entry.sourceNode;
    return (source instanceof VarNode ? source.node : source) instanceof JoinNode;
  });
  expect(legacy).toHaveLength(1);
  expectSourceAlpha(legacy[0]!.sourceNode, fixture.input);
  expect(graph.has(fixture.controls.parameters.backgroundOpacity!)).toBe(true);
  expect(graph.has(fixture.controls.parameters.pattern!)).toBe(true);
  const key = node.getCacheKey();
  fixture.controls.amount.value = 0.37;
  fixture.controls.scale.value = 3;
  fixture.controls.color.value = 1;
  expect(node.getCacheKey()).toBe(key);
  expect(graphNodes(node).has(fixture.controls.amount)).toBe(true);
  expect(graphNodes(node).has(fixture.controls.logicalResolution)).toBe(true);
  expect(graphNodes(node).has(fixture.controls.resolution)).toBe(false);
  fixture.dispose();
});
