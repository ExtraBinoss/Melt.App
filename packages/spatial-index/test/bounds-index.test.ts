import { expect, test } from "vitest";
import { BoundsIndex, type SpatialEntry } from "../src";

const entry = (id: string, x: number, y = 0): SpatialEntry => ({ id, x, y, width: 4, height: 4 });
const ids = (index: BoundsIndex, x: number, width = 0) =>
  index.search({ x, y: 2, width, height: 0 }).sort();

test("inclusive packed searches retain points, edge contacts, negative coordinates and empty indexes", () => {
  const index = new BoundsIndex([
    entry("left", -4),
    entry("right", 0),
    { id: "point", x: 0, y: 2, width: 0, height: 0 },
  ]);
  expect(ids(index, 0)).toEqual(["left", "point", "right"]);
  expect(ids(index, -1)).toEqual(["left"]);
  expect(ids(index, 100)).toEqual([]);
  expect(ids(new BoundsIndex([]), 0)).toEqual([]);
  expect(index.packedBytes).toBeGreaterThan(0);
  expect(new BoundsIndex([]).packedBytes).toBe(0);
  expect(() => new BoundsIndex([entry("same", 0), entry("same", 1)])).toThrow("Duplicate");
});

test("forked edits, deletions and ID reuse never mutate or resurrect records in another snapshot", () => {
  const source = [entry("a", 0), entry("b", 10)];
  const base = new BoundsIndex(source);
  Object.assign(source[0]!, { x: 100 }); // Constructor owns a copy, even for mutable external inputs.
  const moved = base.fork([entry("a", 20)], ["b"]);
  expect(ids(base, 2)).toEqual(["a"]);
  expect(ids(base, 12)).toEqual(["b"]);
  expect(ids(moved, 2)).toEqual([]);
  expect(ids(moved, 22)).toEqual(["a"]);
  expect(ids(moved, 12)).toEqual([]);
  const reused = moved.fork([entry("b", 30)], ["a"]);
  expect(ids(reused, 22)).toEqual([]);
  expect(ids(reused, 32)).toEqual(["b"]);
  expect(ids(moved, 22)).toEqual(["a"]);
  expect(reused.overlaySize).toBe(2);
});

test("bounded overlays repack after 64 changed or deleted IDs without losing uncertainty", () => {
  const entries = Array.from({ length: 70 }, (_, at) => entry(`${at}`, at * 10));
  const base = new BoundsIndex([...entries, entry("uncertain", Infinity)]);
  const changed = base.fork(entries.slice(0, 64).map((e) => ({ ...e, y: 10 })));
  expect(changed.overlaySize).toBe(64);
  const repacked = changed.fork([], ["64"]);
  expect(repacked.overlaySize).toBe(0);
  expect(ids(repacked, 642)).toEqual(["uncertain"]);
  expect(ids(repacked, 692)).toEqual(["69", "uncertain"]);
  expect(ids(base, 2)).toEqual(["0", "uncertain"]);
});

test("unindexable bounds conservatively survive rather than causing false rejection", () => {
  const base = new BoundsIndex([entry("normal", 0), entry("nan", NaN)]);
  expect(ids(base, 100)).toEqual(["nan"]);
  expect(base.search({ x: NaN, y: 0, width: 1, height: 1 }).sort()).toEqual(["nan", "normal"]);
  const changed = base.fork([entry("normal", Infinity)], ["nan"]);
  expect(ids(changed, 100)).toEqual(["normal"]);
});

test("randomized immutable edits agree with an inclusive linear oracle", () => {
  let seed = 718;
  const random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32;
  let entries = Array.from({ length: 200 }, (_, at) =>
    entry(`${at}`, random() * 100, random() * 100),
  );
  let index = new BoundsIndex(entries);
  for (let revision = 0; revision < 80; revision++) {
    const updated = entry(`${revision}`, random() * 100, random() * 100);
    const removed = `${199 - revision}`;
    entries = entries.filter((e) => e.id !== updated.id && e.id !== removed).concat(updated);
    index = index.fork([updated], [removed]);
    for (let at = 0; at < 5; at++) {
      const b = {
        x: random() * 100,
        y: random() * 100,
        width: random() * 10,
        height: random() * 10,
      };
      const expected = entries
        .filter(
          (e) =>
            e.x <= b.x + b.width &&
            e.x + e.width >= b.x &&
            e.y <= b.y + b.height &&
            e.y + e.height >= b.y,
        )
        .map((e) => e.id)
        .sort();
      expect(index.search(b).sort()).toEqual(expected);
    }
  }
});

test("constructor and forks copy only geometry fields without touching arbitrary payloads", () => {
  const payload = {
    ...entry("shape", 0),
    get unrelated() {
      throw new Error("Payload is not geometry");
    },
  };
  const base = new BoundsIndex([payload]);
  const movedPayload = {
    ...entry("shape", 20),
    get unrelated() {
      throw new Error("Payload is not geometry");
    },
  };
  const moved = base.fork([movedPayload]);
  expect(ids(base, 2)).toEqual(["shape"]);
  expect(ids(moved, 22)).toEqual(["shape"]);
});
