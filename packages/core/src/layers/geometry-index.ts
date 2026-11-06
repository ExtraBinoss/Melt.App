import { GeometryQuery } from "./geometry-query";
import type { Composition, Layer } from "../document/model";
import { ensure } from "../errors";
import { SpatialGeometry } from "../spatial/geometry";
import {
  IDENTITY,
  invertMatrix,
  layerTransform,
  multiplyMatrices,
  transformPoint,
  type Bounds,
  type Matrix,
  type Point,
} from "./geometry";

const empty: readonly Layer[] = Object.freeze([]);
const indexes = new WeakMap<Composition, LayerGeometryIndex>();
// Weak, bounded hints accelerate immutable revisions without retaining project/history graphs.
const recent = new Map<string, WeakRef<LayerGeometryIndex>>();
interface HitOptions {
  includeLocked?: boolean;
  contentBounds?: (layer: Layer) => Readonly<Bounds> | null;
  spatialHit?: (layer: Layer) => boolean;
  /** Optional prepared source-ink predicate in layer-local coordinates. */
  localHit?: (layer: Layer, point: Point) => boolean;
  /** Keep legacy group-frame picking unless an artwork picker opts out. */
  groupFallback?: boolean;
}

/** One reusable index per immutable composition; mutable command drafts are never cached. */
export function createLayerGeometryIndex(page: Composition): LayerGeometryIndex {
  // Cache entries were verified before insertion. Frozen containers cannot thaw,
  // so a warm lookup need not repeat integrity checks over the layer array.
  const cached = indexes.get(page);
  if (cached) return cached;
  if (!Object.isFrozen(page) || !Object.isFrozen(page.layers)) return new LayerGeometryIndex(page);
  if (!page.layers.every((layer) => Object.isFrozen(layer))) return new LayerGeometryIndex(page);
  const index = new LayerGeometryIndex(page, recent.get(page.id)?.deref()?.query);
  indexes.set(page, index);
  recent.delete(page.id);
  recent.set(page.id, new WeakRef(index));
  if (recent.size > 8) recent.delete(recent.keys().next().value!);
  return index;
}

function readonlyLayers(layers: Map<string, Layer>): ReadonlyMap<string, Layer> {
  const view: ReadonlyMap<string, Layer> = {
    get size() {
      return layers.size;
    },
    get: (id) => layers.get(id),
    has: (id) => layers.has(id),
    entries: () => layers.entries(),
    keys: () => layers.keys(),
    values: () => layers.values(),
    forEach: (callback, thisArg) =>
      layers.forEach((value, key) => callback.call(thisArg, value, key, view)),
    [Symbol.iterator]: () => layers[Symbol.iterator](),
  };
  return Object.freeze(view);
}

export class LayerGeometryIndex {
  readonly byId: ReadonlyMap<string, Layer>;
  readonly spatialLayers: readonly Layer[];
  readonly #lookup: Map<string, Layer>;
  private positions: Map<string, number> | null = null;
  private hitQueries = 0;
  private readonly childLists = new Map<string | null, readonly Layer[]>();
  private readonly matrices = new Map<string, Matrix>();
  private readonly localInverses = new Map<string, Matrix>();
  private readonly bounds = new Map<string, Readonly<Bounds>>();
  private readonly flags = new Map<string, { locked: boolean; visible: boolean }>();
  private spatial: SpatialGeometry | null = null;
  query: GeometryQuery | undefined;
  constructor(
    private readonly page: Composition,
    private previousQuery?: GeometryQuery,
  ) {
    const byId = new Map<string, Layer>();
    this.#lookup = byId;
    const children = new Map<string | null, Layer[]>();
    const spatialLayers: Layer[] = [];
    for (const layer of page.layers) {
      ensure(!byId.has(layer.id), "INVALID_HIERARCHY", "Duplicate geometry ID");
      byId.set(layer.id, layer);
      if (layer.spatial?.enabled) spatialLayers.push(layer);
      const siblings = children.get(layer.parentId) ?? [];
      siblings.push(layer);
      children.set(layer.parentId, siblings);
    }
    for (const [parent, siblings] of children) this.childLists.set(parent, Object.freeze(siblings));
    this.byId = readonlyLayers(byId);
    this.spatialLayers = Object.freeze(spatialLayers);
    for (const layer of page.layers)
      if (layer.parentId) {
        const parent = byId.get(layer.parentId);
        ensure(
          parent?.kind === "group",
          "INVALID_HIERARCHY",
          "Geometry parent is missing or is not a group",
        );
      }
  }
  documentOrder(id: string): number {
    this.positions ??= new Map(this.page.layers.map((layer, at) => [layer.id, at]));
    return this.positions.get(id)!;
  }
  /** Known IDs use lookup and stable ordering, without scanning every document layer. */
  orderedLayers(ids: Iterable<string>): Layer[] {
    const result: Layer[] = [];
    const seen = new Set<string>();
    for (const id of ids) {
      const layer = this.#lookup.get(id);
      if (layer && !seen.has(id)) {
        result.push(layer);
        seen.add(id);
      }
    }
    if (result.length > this.page.layers.length / 2)
      return this.page.layers.filter((layer) => seen.has(layer.id));
    return result.sort((a, b) => this.documentOrder(a.id) - this.documentOrder(b.id));
  }
  get(id: string): Layer {
    const layer = this.#lookup.get(id);
    ensure(layer, "NOT_FOUND", "Geometry layer is missing");
    return layer;
  }
  children(parentId: string | null): readonly Layer[] {
    return this.childLists.get(parentId) ?? empty;
  }
  ancestors(id: string): Layer[] {
    const result: Layer[] = [],
      seen = new Set([id]);
    let layer = this.get(id);
    while (layer.parentId) {
      ensure(!seen.has(layer.parentId), "INVALID_HIERARCHY", "Geometry parent cycle");
      seen.add(layer.parentId);
      layer = this.get(layer.parentId);
      result.push(layer);
    }
    return result.reverse();
  }
  worldMatrix(id: string): Matrix {
    const cached = this.matrices.get(id);
    if (cached) return cached;
    const pending: Layer[] = [],
      seen = new Set<string>();
    let current: string | null = id;
    while (current !== null && !this.matrices.has(current)) {
      ensure(!seen.has(current), "INVALID_HIERARCHY", "Geometry parent cycle");
      seen.add(current);
      const layer = this.get(current);
      pending.push(layer);
      current = layer.parentId;
    }
    let matrix = current === null ? IDENTITY : this.matrices.get(current)!;
    let flags = current === null ? { locked: false, visible: true } : this.flags.get(current)!;
    for (let at = pending.length - 1; at >= 0; at--) {
      const layer = pending[at]!;
      matrix = Object.freeze(multiplyMatrices(matrix, layerTransform(layer)));
      flags = {
        locked: flags.locked || layer.locked,
        visible: flags.visible && layer.visible && layer.opacity > 0,
      };
      this.matrices.set(layer.id, matrix);
      this.flags.set(layer.id, flags);
    }
    return this.matrices.get(id)!;
  }
  isLocked(id: string): boolean {
    const layer = this.get(id);
    if (layer.parentId === null) return layer.locked;
    this.worldMatrix(id);
    return this.flags.get(id)!.locked;
  }
  isVisible(id: string): boolean {
    const layer = this.get(id);
    if (layer.parentId === null) return layer.visible && layer.opacity > 0;
    this.worldMatrix(id);
    return this.flags.get(id)!.visible;
  }
  isMaskSource(id: string): boolean {
    return this.get(id).maskSource === true || this.ancestors(id).some((layer) => layer.maskSource);
  }
  worldBounds(id: string): Readonly<Bounds> {
    const cached = this.bounds.get(id);
    if (cached) return cached;
    const layer = this.get(id);
    if (layer.spatial?.enabled) {
      const bounds = Object.freeze(
        (this.spatial ??= new SpatialGeometry(this.page, this.byId)).projectedBounds(id),
      );
      this.bounds.set(id, bounds);
      return bounds;
    }
    if (
      layer.parentId === null &&
      layer.rotation === 0 &&
      !layer.affine &&
      (layer.scaleX ?? 1) === 1 &&
      (layer.scaleY ?? 1) === 1
    ) {
      const direct = Object.freeze({
        x: layer.x,
        y: layer.y,
        width: layer.width,
        height: layer.height,
      });
      this.bounds.set(id, direct);
      return direct;
    }
    const matrix = this.worldMatrix(id);
    const corners = [
      { x: 0, y: 0 },
      { x: layer.width, y: 0 },
      { x: layer.width, y: layer.height },
      { x: 0, y: layer.height },
    ].map((point) => transformPoint(matrix, point));
    const left = Math.min(...corners.map((point) => point.x)),
      top = Math.min(...corners.map((point) => point.y));
    const bounds = Object.freeze({
      x: left,
      y: top,
      width: Math.max(...corners.map((point) => point.x)) - left,
      height: Math.max(...corners.map((point) => point.y)) - top,
    });
    this.bounds.set(id, bounds);
    return bounds;
  }
  /** Inclusive broad-phase candidates in document order; consumers keep their exact predicate. */
  queryBounds(bounds: Bounds, ordered = true): Layer[] {
    if (!this.query) {
      this.query = new GeometryQuery(this.page, this, this.previousQuery);
      this.previousQuery = undefined;
    }
    return this.query.search(bounds, this, ordered);
  }
  /** One union allocation; missing IDs are skipped for transient selections of removed layers. */
  collectiveBounds(ids: Iterable<string>): Readonly<Bounds> | null {
    let left = Infinity,
      top = Infinity,
      right = -Infinity,
      bottom = -Infinity;
    for (const id of ids) {
      const layer = this.#lookup.get(id);
      if (!layer) continue;
      const bounds =
        !layer.spatial?.enabled &&
        layer.parentId === null &&
        layer.rotation === 0 &&
        !layer.affine &&
        (layer.scaleX ?? 1) === 1 &&
        (layer.scaleY ?? 1) === 1
          ? layer
          : this.worldBounds(id);
      left = Math.min(left, bounds.x);
      top = Math.min(top, bounds.y);
      right = Math.max(right, bounds.x + bounds.width);
      bottom = Math.max(bottom, bounds.y + bounds.height);
    }
    return Number.isFinite(left)
      ? Object.freeze({ x: left, y: top, width: right - left, height: bottom - top })
      : null;
  }
  /** Parent-local traversal rejects cheap bounds before allocating any world geometry. */
  hitTest(point: Point, options: HitOptions = {}): Layer | null {
    // One-off evaluated poses should pay only the original exact scan. Build the
    // broad phase after reuse establishes an opportunity to amortize preparation.
    if (!this.query && this.hitQueries++ === 0)
      return this.hitTestCandidates(point, options) ?? null;
    // Preserve the original O(1) foreground/all-overlap hit. This probe executes
    // the exact same narrow phase, and an exhausted budget never grants a hit.
    const foreground = this.hitTestCandidates(point, options, undefined, 8);
    if (foreground !== undefined) return foreground;
    const candidates = this.queryBounds({ x: point.x, y: point.y, width: 0, height: 0 }, false);
    // A renderer's triangle result is authoritative even when an imported/native source
    // has a conservative projection different from its prepared resource geometry.
    if (options.spatialHit)
      for (const layer of this.spatialLayers)
        if (
          layer.spatial?.enabled &&
          layer.kind !== "group" &&
          options.spatialHit(layer) &&
          !candidates.includes(layer)
        )
          candidates.push(layer);
    if (!candidates.length) return null;
    let childLists: Map<string | null, Layer[]> | null = null;
    // Dense overlap already has an efficient topmost-first traversal. Avoid sorting or
    // rebuilding every sibling list when the broad phase cannot reject most records.
    if (candidates.length < this.page.layers.length / 2) {
      childLists = new Map();
      const included = new Set<string>();
      for (const candidate of candidates) {
        let layer: Layer | undefined = candidate;
        while (layer && !included.has(layer.id)) {
          included.add(layer.id);
          const siblings = childLists.get(layer.parentId) ?? [];
          siblings.push(layer);
          childLists.set(layer.parentId, siblings);
          layer = layer.parentId ? this.#lookup.get(layer.parentId) : undefined;
        }
      }
      for (const siblings of childLists.values())
        siblings.sort((a, b) => this.documentOrder(a.id) - this.documentOrder(b.id));
    }
    const childrenOf = (id: string | null): readonly Layer[] =>
      childLists ? (childLists.get(id) ?? empty) : this.children(id);
    return this.hitTestCandidates(point, options, childrenOf) ?? null;
  }
  /** Explicit overlap queries visit each candidate once in hierarchical paint order. */
  hitTestAll(point: Point, options: HitOptions = {}): Layer[] {
    const hits: Layer[] = [];
    this.hitTestCandidates(point, options, undefined, Infinity, hits);
    return hits;
  }
  private hitTestCandidates(
    point: Point,
    options: HitOptions,
    childrenOf: (id: string | null) => readonly Layer[] = (id) => this.children(id),
    budget = Infinity,
    hits?: Layer[],
  ): Layer | null | undefined {
    let visited = 0;
    const roots = childrenOf(null);
    const stack: {
      children: readonly Layer[];
      at: number;
      point: Point;
      fallback?: Layer | undefined;
    }[] = [{ children: roots, at: roots.length - 1, point }];
    while (stack.length) {
      const frame = stack[stack.length - 1]!;
      if (frame.at < 0) {
        stack.pop();
        if (frame.fallback) {
          if (!hits) return frame.fallback;
          hits.push(frame.fallback);
        }
        continue;
      }
      if (visited++ >= budget) return undefined;
      const layer = frame.children[frame.at--]!;
      if (
        layer.maskSource ||
        (layer.locked && !options.includeLocked) ||
        !layer.visible ||
        layer.opacity <= 0
      )
        continue;
      let local: Point;
      if (layer.spatial?.enabled) {
        if (layer.kind !== "group" && options.spatialHit) {
          if (options.spatialHit(layer)) {
            if (!hits) return layer;
            hits.push(layer);
          }
          continue;
        }
        const bounds = this.worldBounds(layer.id);
        if (
          point.x < bounds.x ||
          point.y < bounds.y ||
          point.x > bounds.x + bounds.width ||
          point.y > bounds.y + bounds.height
        )
          continue;
        if (layer.kind !== "group") {
          if (!hits) return layer;
          hits.push(layer);
          continue;
        }
        const children = childrenOf(layer.id);
        stack.push({
          children,
          at: children.length - 1,
          point: frame.point,
          fallback: options.groupFallback === false ? undefined : layer,
        });
        continue;
      }
      if (
        !layer.affine &&
        layer.rotation === 0 &&
        (layer.scaleX ?? 1) === 1 &&
        (layer.scaleY ?? 1) === 1
      ) {
        const x = frame.point.x - layer.x,
          y = frame.point.y - layer.y;
        if (x < 0 || y < 0 || x > layer.width || y > layer.height) continue;
        local = { x, y };
      } else {
        const matrix = layerTransform(layer);
        const radiusX =
            (layer.width * Math.abs(matrix[0]) + layer.height * Math.abs(matrix[2])) / 2,
          radiusY = (layer.width * Math.abs(matrix[1]) + layer.height * Math.abs(matrix[3])) / 2;
        if (
          Math.abs(frame.point.x - layer.x - layer.width / 2) > radiusX ||
          Math.abs(frame.point.y - layer.y - layer.height / 2) > radiusY
        )
          continue;
        let inverse = this.localInverses.get(layer.id);
        if (!inverse) {
          inverse = invertMatrix(matrix);
          this.localInverses.set(layer.id, inverse);
        }
        local = transformPoint(inverse, frame.point);
        if (local.x < 0 || local.y < 0 || local.x > layer.width || local.y > layer.height) continue;
      }
      const ink = options.contentBounds?.(layer);
      if (
        ink &&
        (local.x < ink.x ||
          local.y < ink.y ||
          local.x > ink.x + ink.width ||
          local.y > ink.y + ink.height)
      )
        continue;
      if (
        layer.kind === "ellipse" &&
        ((local.x - layer.width / 2) / (layer.width / 2)) ** 2 +
          ((local.y - layer.height / 2) / (layer.height / 2)) ** 2 >
          1
      )
        continue;
      if (layer.kind !== "group") {
        if (!options.localHit || options.localHit(layer, local)) {
          if (!hits) return layer;
          hits.push(layer);
        }
        continue;
      }
      const children = childrenOf(layer.id);
      stack.push({
        children,
        at: children.length - 1,
        point: local,
        fallback: options.groupFallback === false ? undefined : layer,
      });
    }
    return null;
  }
}
