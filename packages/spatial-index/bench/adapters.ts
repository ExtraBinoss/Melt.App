import Flatbush from "flatbush";
import RBush from "rbush";
import { BoundsIndex, type SpatialBounds, type SpatialEntry } from "../src";
import { linear } from "./fixtures";
export interface Adapter {
  search(bounds: SpatialBounds): string[];
  update(changes: readonly SpatialEntry[], removed: readonly string[]): Adapter;
  packedBytes: number | null;
  overlaySize: number | null;
}
export interface Strategy {
  name: string;
  build(entries: readonly SpatialEntry[]): Adapter;
}
const replaced = (
  entries: readonly SpatialEntry[],
  changes: readonly SpatialEntry[],
  removed: readonly string[],
) => {
  const byId = new Map(entries.map((e) => [e.id, e]));
  for (const id of removed) byId.delete(id);
  for (const entry of changes) byId.set(entry.id, entry);
  return [...byId.values()];
};
function packed(entries: readonly SpatialEntry[]): Adapter {
  const tree = entries.length ? new Flatbush(entries.length) : null;
  for (const e of entries) tree!.add(e.x, e.y, e.x + e.width, e.y + e.height);
  tree?.finish();
  return {
    search: (b) =>
      tree?.search(b.x, b.y, b.x + b.width, b.y + b.height).map((at) => entries[at]!.id) ?? [],
    update: (changed, removed) => packed(replaced(entries, changed, removed)),
    packedBytes: tree?.data.byteLength ?? 0,
    overlaySize: null,
  };
}
function hybrid(index: BoundsIndex): Adapter {
  return {
    search: (b) => index.search(b),
    update: (changed, removed) => hybrid(index.fork(changed, removed)),
    packedBytes: index.packedBytes,
    overlaySize: index.overlaySize,
  };
}
interface TreeEntry {
  id: string;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}
const treeEntry = (e: SpatialEntry): TreeEntry => ({
  id: e.id,
  minX: e.x,
  minY: e.y,
  maxX: e.x + e.width,
  maxY: e.y + e.height,
});
function dynamic(entries: readonly SpatialEntry[]): Adapter {
  const tree = new RBush<TreeEntry>();
  const byId = new Map(entries.map((e) => [e.id, treeEntry(e)]));
  tree.load([...byId.values()]);
  const adapter: Adapter = {
    search: (b) =>
      tree
        .search({ minX: b.x, minY: b.y, maxX: b.x + b.width, maxY: b.y + b.height })
        .map((e) => e.id),
    // RBush mutates in place; the benchmark deliberately permits its natural update API.
    update(changed, removed) {
      for (const id of [...removed, ...changed.map((e) => e.id)]) {
        const old = byId.get(id);
        if (old) tree.remove(old);
        byId.delete(id);
      }
      for (const e of changed) {
        const item = treeEntry(e);
        byId.set(e.id, item);
        tree.insert(item);
      }
      return adapter;
    },
    packedBytes: null,
    overlaySize: null,
  };
  return adapter;
}
export const strategies: Strategy[] = [
  {
    name: "linear",
    build: (entries) => ({
      search: (b) => linear(entries, b),
      update: (changed, removed) => strategies[0]!.build(replaced(entries, changed, removed)),
      packedBytes: 0,
      overlaySize: null,
    }),
  },
  { name: "flatbush-4.7.0", build: packed },
  { name: "rbush-4.0.1", build: dynamic },
  { name: "flatbush-bounded-overlay", build: (entries) => hybrid(new BoundsIndex(entries)) },
];
