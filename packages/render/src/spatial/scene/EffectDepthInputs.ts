import { createLayerGeometryIndex, type Bounds, type Composition, type Matrix } from "@musart/core";
import { DepthTexture, FloatType, RenderTarget, type Matrix4 } from "three/webgpu";
import { effectDepthUv, effectFocusPoint } from "./effect-depth-mapping";
import { windowProjection } from "./projection";

export interface DepthFocusPoint {
  readonly id: string;
  readonly x: number;
  readonly y: number;
}
const TARGET_OVERHEAD = 4096;
const FOCUS_LIMIT = 64;
const depthTarget = () =>
  new RenderTarget(1, 1, {
    depthBuffer: true,
    depthTexture: new DepthTexture(1, 1, FloatType),
  });
const activeFocusIds = (page: Composition) =>
  new Set(
    [...(page.effects ?? []), ...page.layers.flatMap((layer) => layer.effects)]
      .filter(
        (effect) =>
          effect.enabled &&
          effect.type === "depth-of-field" &&
          effect.settings?.focusMode === "point",
      )
      .map((effect) => effect.id),
  );
const needsLocalDepth = (page: Composition) =>
  page.layers.some((layer) =>
    layer.effects.some((effect) => effect.enabled && effect.type === "depth-of-field"),
  );

/** One reusable local depth raster and at most 64 single-pixel focus rasters.
 * The composition cache admits their complete projected cost before sync/resize.
 */
export class EffectDepthInputs {
  private local: RenderTarget | null = null;
  private readonly focus = new Map<string, RenderTarget>();
  private page: Composition | null = null;
  private viewport?: Bounds;
  private readonly layouts = new Map<string, Matrix>();
  private readonly owners = new Map<string, ReadonlySet<string>>();
  get bytes() {
    return (
      (this.local ? this.local.width * this.local.height * 8 + TARGET_OVERHEAD : 0) +
      this.focus.size * (TARGET_OVERHEAD + 8)
    );
  }
  get targets() {
    return (this.local ? 1 : 0) + this.focus.size;
  }
  projectedBytes(width: number, height: number, page?: Composition) {
    if (!page) return this.bytes;
    const ids = activeFocusIds(page);
    if (ids.size > FOCUS_LIMIT) throw RangeError("Native depth focus exceeds the 64-point budget");
    return (
      (needsLocalDepth(page) ? width * height * 8 + TARGET_OVERHEAD : 0) +
      ids.size * (TARGET_OVERHEAD + 8)
    );
  }
  sync(
    page: Composition,
    width: number,
    height: number,
    sourceIds: Iterable<string>,
    viewport?: Bounds,
  ) {
    this.projectedBytes(width, height, page);
    this.page = page;
    this.viewport = viewport;
    if (needsLocalDepth(page)) {
      this.local ??= depthTarget();
      this.local.setSize(width, height);
    } else {
      this.local?.dispose();
      this.local = null;
    }
    const ids = activeFocusIds(page);
    for (const [id, target] of this.focus)
      if (!ids.has(id)) {
        target.dispose();
        this.focus.delete(id);
      }
    for (const id of ids) if (!this.focus.has(id)) this.focus.set(id, depthTarget());
    this.layouts.clear();
    this.owners.clear();
    const index = createLayerGeometryIndex(page);
    const owners = new Map<string, Set<string>>();
    for (const id of sourceIds) {
      for (const layer of [index.get(id), ...index.ancestors(id)]) {
        let children = owners.get(layer.id);
        if (!children) {
          children = new Set();
          owners.set(layer.id, children);
        }
        children.add(id);
      }
    }
    for (const [id, sources] of owners) {
      this.owners.set(id, sources);
      this.layouts.set(id, index.worldMatrix(id));
    }
  }
  /** Local ownership includes real descendant meshes for native groups. */
  ownerSources(id: string) {
    return this.owners.get(id);
  }
  localTarget(id: string) {
    if (!this.owners.has(id)) return null;
    if (!this.local) throw Error("Native layer depth was not admitted before rendering");
    return this.local;
  }
  uv(id: string, transport: Bounds, projection?: readonly number[]) {
    return effectDepthUv(this.page!, transport, this.layouts.get(id), projection, this.viewport);
  }
  focusTarget(
    point: DepthFocusPoint,
    camera: Matrix4,
    ownerId?: string,
    projection?: readonly number[],
  ) {
    const target = this.focus.get(point.id);
    if (!target || !this.page) throw Error("Native point focus was not admitted before rendering");
    const owner = ownerId ? this.page.layers.find((layer) => layer.id === ownerId) : this.page;
    if (!owner) throw Error("Native depth owner is unavailable");
    const location = effectFocusPoint(
      owner.width,
      owner.height,
      point.x,
      point.y,
      ownerId ? this.layouts.get(ownerId) : undefined,
      projection,
    );
    return {
      target,
      // A one-document-pixel gate centered on the requested point is independent
      // of the displayed viewport, export crop, density and spare texture capacity.
      projection: windowProjection(this.page, {
        x: location.x - 0.5,
        y: location.y - 0.5,
        width: 1,
        height: 1,
      }).multiply(camera),
    };
  }
  clear() {
    this.local?.dispose();
    this.local = null;
    for (const target of this.focus.values()) target.dispose();
    this.focus.clear();
    this.layouts.clear();
    this.owners.clear();
    this.page = null;
  }
}
