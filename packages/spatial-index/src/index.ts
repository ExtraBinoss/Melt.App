import Flatbush from "flatbush";

export interface SpatialBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}
export interface SpatialEntry extends SpatialBounds {
  readonly id: string;
}

const intersects = (a: SpatialBounds, b: SpatialBounds) =>
  a.x <= b.x + b.width && a.y <= b.y + b.height && a.x + a.width >= b.x && a.y + a.height >= b.y;
const finite = (b: SpatialBounds) =>
  Number.isFinite(b.x) &&
  Number.isFinite(b.y) &&
  Number.isFinite(b.x + b.width) &&
  Number.isFinite(b.y + b.height) &&
  b.width >= 0 &&
  b.height >= 0;

const copyEntry = (entry: SpatialEntry): SpatialEntry =>
  Object.freeze({
    id: entry.id,
    x: entry.x,
    y: entry.y,
    width: entry.width,
    height: entry.height,
  });

/** Immutable, conservative broad phase. Callers retain ordering and exact hit semantics. */
export class BoundsIndex {
  private tree: Flatbush | null;
  private entries: readonly SpatialEntry[];
  private uncertain: readonly string[];
  private edits: ReadonlyMap<string, SpatialEntry | null>;

  constructor(entries: readonly SpatialEntry[]) {
    const valid: SpatialEntry[] = [],
      uncertain: string[] = [],
      seen = new Set<string>();
    for (const value of entries) {
      if (seen.has(value.id)) throw new Error(`Duplicate spatial ID: ${value.id}`);
      seen.add(value.id);
      const entry = copyEntry(value);
      if (finite(entry)) valid.push(entry);
      else uncertain.push(entry.id);
    }
    this.entries = valid;
    this.uncertain = uncertain;
    this.edits = new Map();
    this.tree = valid.length ? new Flatbush(valid.length) : null;
    for (const entry of valid)
      this.tree!.add(entry.x, entry.y, entry.x + entry.width, entry.y + entry.height);
    this.tree?.finish();
  }

  /** Each fork shares only a packed base, never a chain of preceding snapshots. */
  fork(changes: readonly SpatialEntry[], removed: readonly string[] = []): BoundsIndex {
    const edits = new Map(this.edits);
    for (const id of removed) edits.set(id, null);
    for (const entry of changes) edits.set(entry.id, copyEntry(entry));
    // Bound both tombstones and changed records. Repack outside pointer previews when possible.
    if (edits.size > 64) {
      const entries = this.entries.filter((entry) => !edits.has(entry.id));
      for (const id of this.uncertain)
        if (!edits.has(id)) entries.push({ id, x: NaN, y: NaN, width: NaN, height: NaN });
      for (const entry of edits.values()) if (entry) entries.push(entry);
      return new BoundsIndex(entries);
    }
    const next = new BoundsIndex([]);
    next.tree = this.tree;
    next.entries = this.entries;
    next.uncertain = this.uncertain;
    next.edits = edits;
    return next;
  }

  search(bounds: SpatialBounds): string[] {
    const all = !finite(bounds);
    const candidates = all
      ? this.entries.map((_, index) => index)
      : (this.tree?.search(bounds.x, bounds.y, bounds.x + bounds.width, bounds.y + bounds.height) ??
        []);
    const result: string[] = [];
    for (const at of candidates) {
      const id = this.entries[at]!.id;
      if (!this.edits.has(id)) result.push(id);
    }
    for (const id of this.uncertain) if (!this.edits.has(id)) result.push(id);
    for (const entry of this.edits.values())
      if (entry && (all || !finite(entry) || intersects(entry, bounds))) result.push(entry.id);
    return result;
  }

  /** Exact packed-buffer bytes; JS entries/maps and query allocations are additional. */
  get packedBytes(): number {
    return this.tree?.data.byteLength ?? 0;
  }
  get overlaySize(): number {
    return this.edits.size;
  }
}
