import { expect, test } from "vitest";
import { validateVector } from "../../src/vector/validation";
import {
  editVectorPath,
  writeVectorPath,
  moveVectorNode,
  moveVectorHandle,
  vectorNodeMode,
  setVectorNodeMode,
  splitVectorSegment,
  removeVectorNode,
  roundVectorNode,
  canRoundVectorNode,
  createLayer,
  createPage,
  createProject,
  EditorEngine,
  parseProject,
  serializeProject,
  type VectorNode,
  type VectorPoint,
} from "../../src/index";
const curve = (a: VectorNode, b: VectorNode, t: number): VectorPoint => {
  const p = a.outgoing ?? a,
    q = b.incoming ?? b,
    s = 1 - t;
  return {
    x: s ** 3 * a.x + 3 * s * s * t * p.x + 3 * s * t * t * q.x + t ** 3 * b.x,
    y: s ** 3 * a.y + 3 * s * s * t * p.y + 3 * s * t * t * q.y + t ** 3 * b.y,
  };
};
test("normalizes every SVG command, multiple contours, closing curves and affine transforms", () => {
  const paths = editVectorPath({
    path: "m0 0h40v20h-40z M60 0q10 20 20 0t20 0a10 10 30 0 1 20 10s20 10 20 0",
    matrix: [2, 0, 0, 3, 10, 20],
  });
  expect(paths).toHaveLength(2);
  expect(paths[0]!.closed).toBe(true);
  expect(paths[1]!.closed).toBe(false);
  expect(paths[0]!.nodes[0]).toMatchObject({ x: 10, y: 20 });
  expect(paths[0]!.nodes[2]).toMatchObject({ x: 90, y: 80 });
  const encoded = writeVectorPath(paths);
  expect(encoded).not.toMatch(/[hvaqst]/i);
  const restored = editVectorPath({ path: encoded });
  expect(restored[1]!.nodes).toHaveLength(paths[1]!.nodes.length);
  const closed = editVectorPath({ path: "M0 0 C0 10 10 10 0 0 Z" })[0]!;
  expect(closed.nodes).toHaveLength(1);
  expect(closed.nodes[0]!.incoming).toEqual({ x: 10, y: 10 });
  expect(writeVectorPath([closed])).toContain("C");
});
test("subdivision preserves a cubic exactly and node movement translates its handles", () => {
  const path = editVectorPath({ path: "M0 0 C20 100 80 -20 100 40" })[0]!,
    a = structuredClone(path.nodes[0]!),
    b = structuredClone(path.nodes[1]!);
  expect(splitVectorSegment(path, 0)).toBe(1);
  for (let i = 0; i <= 20; i++) {
    const t = i / 20,
      expected = curve(a, b, t),
      actual =
        t <= 0.5
          ? curve(path.nodes[0]!, path.nodes[1]!, t * 2)
          : curve(path.nodes[1]!, path.nodes[2]!, t * 2 - 1);
    expect(actual.x).toBeCloseTo(expected.x, 8);
    expect(actual.y).toBeCloseTo(expected.y, 8);
  }
  const node = path.nodes[1]!,
    old = structuredClone(node);
  moveVectorNode(node, { x: node.x + 10, y: node.y - 4 });
  expect(node.incoming!.x - old.incoming!.x).toBe(10);
  expect(node.outgoing!.y - old.outgoing!.y).toBe(-4);
});
test("node modes constrain handles and rounding creates bounded tangent corners", () => {
  const path = editVectorPath({ path: "M0 0L100 0L100 100L0 100Z" })[0]!;
  expect(canRoundVectorNode(path, 1)).toBe(true);
  roundVectorNode(path, 1, 20);
  expect(path.nodes).toHaveLength(5);
  expect(path.nodes[1]!.x).toBeCloseTo(80);
  expect(path.nodes[2]!.y).toBeCloseTo(20);
  expect(canRoundVectorNode(path, 1)).toBe(false);
  setVectorNodeMode(path, 3, "symmetric");
  const node = path.nodes[3]!;
  expect(vectorNodeMode(node)).toBe("symmetric");
  moveVectorHandle(node, "outgoing", { x: node.x + 9, y: node.y + 13 }, "symmetric");
  expect(node.incoming).toEqual({ x: node.x - 9, y: node.y - 13 });
  setVectorNodeMode(path, 3, "corner");
  expect(node.incoming).toBeUndefined();
  expect(vectorNodeMode(node)).toBe("corner");
  removeVectorNode(path, 3);
  removeVectorNode(path, 2);
  expect(() => removeVectorNode(path, 0)).toThrow("MINIMUM");
});
test("path edits and stroke parameters persist and undo atomically through the public command registry", () => {
  const original = { viewBox: "0 0 100 100", path: "M0 0L100 0L100 100Z" };
  const engine = new EditorEngine(
    createProject({
      pages: [createPage({ layers: [createLayer("vector", { id: "shape", vector: original })] })],
    }),
  );
  const paths = editVectorPath(original);
  roundVectorNode(paths[0]!, 1, 16);
  engine.execute({
    type: "updateLayers",
    ids: ["shape"],
    patch: {
      vector: {
        viewBox: original.viewBox,
        parts: [{ path: writeVectorPath(paths), linecap: "round", linejoin: "bevel" }],
      },
    },
  });
  const changed = engine.getSnapshot().project;
  expect(parseProject(serializeProject(changed))).toEqual(changed);
  engine.undo();
  expect(engine.getSnapshot().project.pages[0]!.layers[0]!.vector).toEqual(original);
  engine.redo();
  expect(engine.getSnapshot().project).toEqual(changed);
  expect(() => editVectorPath({ path: "M0 0" + "L1 1".repeat(4097) })).toThrow("COMPLEX");
  expect(() => editVectorPath({ path: "nonsense" })).toThrow();
});

test("corner parameters remain editable after save and reject inconsistent or stale rendered outlines", async () => {
  const { writeRoundedVectorPath } = await import("../../src/index");
  const source = "M0 0L100 0L100 100L0 100Z",
    paths = editVectorPath({ path: source }),
    rounding = [{ contour: 0, node: 1, radius: 20 }];
  const vector = {
    viewBox: "0 0 100 100",
    parts: [
      {
        path: writeRoundedVectorPath(paths, rounding),
        nodeEditing: { version: 1 as const, path: source, rounding },
      },
    ],
  };
  validateVector(vector);
  const engine = new EditorEngine(
    createProject({ pages: [createPage({ layers: [createLayer("vector", { vector })] })] }),
  );
  const restored = parseProject(serializeProject(engine.getSnapshot().project));
  expect(restored.pages[0]!.layers[0]!.vector).toEqual(vector);
  expect(() =>
    validateVector({ ...vector, parts: [{ ...vector.parts[0], path: source }] }),
  ).toThrow("does not match");
  expect(() =>
    validateVector({
      ...vector,
      parts: [
        {
          ...vector.parts[0],
          nodeEditing: {
            ...vector.parts[0]!.nodeEditing,
            rounding: [{ contour: 0, node: 40, radius: 2 }],
          },
        },
      ],
    }),
  ).toThrow("corner");
  const open = editVectorPath({ path: "M0 0L100 100" })[0]!;
  setVectorNodeMode(open, 0, "smooth");
  expect(open.nodes[0]!.outgoing!.x).toBeCloseTo(100 / 3, 10);
  expect(open.nodes[0]!.outgoing!.y).toBeCloseTo(100 / 3, 10);
  expect(open.nodes[0]!.incoming).toBeUndefined();
});
