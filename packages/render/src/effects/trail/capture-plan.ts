import {
  createLayerGeometryIndex,
  resolveEffectSettings,
  resolveTrailMode,
  transformPoint,
  type Bounds,
  type Composition,
  type Effect,
  type MotionTime,
} from "@musart/core";
import { getTrailSamples, type TrailSampleRequest } from "./samples";
import { rasterExtent } from "../../compositing/types";
import { effectFootprint } from "../shared/footprint";

export interface TrailCaptureRequest {
  readonly effect: Effect;
  /** Undefined denotes the final composition stack. */
  readonly ownerId?: string;
  readonly samples: readonly TrailSampleRequest[];
}

export function isTemporalTrail(effect: Effect, page?: Composition, ownerId?: string): boolean {
  if (effect.type !== "trail") return false;
  const resolved = page ? resolveTrailMode(effect, page, ownerId) : effect;
  return resolveEffectSettings(resolved).mode !== "offset";
}

/** The same schedule serves random access, reverse playback and export. */
export function trailCaptureRequests(page: Composition, time: MotionTime): TrailCaptureRequest[] {
  const geometry = createLayerGeometryIndex(page);
  const requests: TrailCaptureRequest[] = [];
  for (const owner of [page, ...page.layers]) {
    if (owner !== page && !geometry.isVisible(owner.id)) continue;
    for (const effect of owner.effects ?? []) {
      const ownerId = owner === page ? undefined : owner.id;
      if (!isTemporalTrail(effect, page, ownerId) || !effect.enabled || effect.amount <= 0)
        continue;
      const samples = getTrailSamples(resolveTrailMode(effect, page, ownerId), time);
      if (samples.length)
        requests.push({ effect, ...(owner === page ? {} : { ownerId: owner.id }), samples });
    }
  }
  if (requests.reduce((count, request) => count + request.samples.length, 0) > 32)
    throw new Error("Temporal effects exceed the shared 32-snapshot budget.");
  return requests;
}

/** Retain the complete scene for native depth, shadows, reflections and mask dependencies.
 * Paint isolation is a compositor traversal option, never a visibility mutation here.
 */
export function trailUpstreamPage(page: Composition, request: TrailCaptureRequest): Composition {
  const truncate = (stack: readonly Effect[], owner: boolean, ownerId?: string): Effect[] => {
    const before = owner ? stack.findIndex((effect) => effect.id === request.effect.id) : -1;
    const upstream = owner ? (before < 0 ? [] : stack.slice(0, before)) : stack;
    // Static offset echoes are ordinary upstream treatments. Historical operators cannot recurse.
    return upstream.filter((effect) => !isTemporalTrail(effect, page, ownerId));
  };
  return {
    ...page,
    effects: request.ownerId ? [] : truncate(page.effects ?? [], true),
    layers: page.layers.map((layer) => ({
      ...layer,
      effects: truncate(layer.effects, layer.id === request.ownerId, layer.id),
    })),
  };
}

/** Include upstream padding in the historical footprint before mapping to the present plane. */
export function trailHistoricalBounds(
  page: Composition,
  ownerId: string,
  captureBounds: Bounds,
): Bounds {
  const geometry = createLayerGeometryIndex(page),
    owner = geometry.get(ownerId),
    outset = effectFootprint(owner.effects);
  if (!outset.left && !outset.top && !outset.right && !outset.bottom)
    return geometry.worldBounds(ownerId);
  // Prepared native meshes can project beyond their authored plane. The captured gate
  // is a safe conservative fallback when an upstream native treatment expands them.
  if (owner.spatial?.enabled) return captureBounds;
  const matrix = geometry.worldMatrix(ownerId),
    left = -outset.left,
    top = -outset.top,
    right = owner.width + outset.right,
    bottom = owner.height + outset.bottom,
    points = [
      { x: left, y: top },
      { x: right, y: top },
      { x: right, y: bottom },
      { x: left, y: bottom },
    ].map((point) => transformPoint(matrix, point)),
    x = Math.min(...points.map((point) => point.x)),
    y = Math.min(...points.map((point) => point.y));
  return {
    x,
    y,
    width: Math.max(...points.map((point) => point.x)) - x,
    height: Math.max(...points.map((point) => point.y)) - y,
  };
}

/** Keep the canonical capture rectangle; only sampling density is reduced under pressure. */
export function trailCaptureRaster(
  bounds: Bounds,
  requestedScale: number,
  count: number,
  maxDimension: number,
  maxBytes: number,
): { scale: number; width: number; height: number } {
  if (
    ![bounds.x, bounds.y, bounds.width, bounds.height, requestedScale, maxBytes].every(
      Number.isFinite,
    ) ||
    bounds.width <= 0 ||
    bounds.height <= 0 ||
    requestedScale <= 0 ||
    !Number.isInteger(count) ||
    count < 1 ||
    count > 32 ||
    !Number.isInteger(maxDimension) ||
    maxDimension < 1 ||
    maxBytes < count * 8
  )
    throw new RangeError("Invalid temporal capture budget or rectangle.");
  const pixels = Math.floor(maxBytes / (count * 8));
  const requestedWidth = rasterExtent(bounds.width, requestedScale),
    requestedHeight = rasterExtent(bounds.height, requestedScale);
  if (
    requestedWidth <= maxDimension &&
    requestedHeight <= maxDimension &&
    requestedWidth * requestedHeight <= pixels
  )
    return { scale: requestedScale, width: requestedWidth, height: requestedHeight };
  let scale = Math.min(
    requestedScale,
    maxDimension / bounds.width,
    maxDimension / bounds.height,
    Math.sqrt(pixels / (bounds.width * bounds.height)),
  );
  // Flooring the admitted axes keeps ceil rasterization inside both limits.
  let width = Math.max(1, Math.floor(bounds.width * scale)),
    height = Math.max(1, Math.floor(bounds.height * scale));
  while (width * height > pixels) {
    if (width >= height) width--;
    else height--;
  }
  scale = Math.min(width / bounds.width, height / bounds.height);
  return {
    scale,
    width: Math.max(1, Math.ceil(bounds.width * scale - Number.EPSILON * width * 4)),
    height: Math.max(1, Math.ceil(bounds.height * scale - Number.EPSILON * height * 4)),
  };
}
