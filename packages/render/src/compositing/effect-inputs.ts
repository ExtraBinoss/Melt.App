import {
  createLayerGeometryIndex,
  getEffectDefinition,
  resolveEffectSettings,
  type Bounds,
  type Composition,
  type Effect,
  type Layer,
} from "@musart/core";
import { Matrix3 } from "three/webgpu";
import type { SpatialSources } from "../spatial/SpatialSources";
import type { EffectAuxiliaryInputs, EffectHistoryInput } from "../effects/shared/context";
import { finiteProjectedPoints } from "./projected-window";

/** Current effect author plane to composition pixels, including a native camera homography. */
export function effectToComposition(
  page: Composition,
  layer: Layer,
  projection?: readonly number[],
) {
  const [a, b, c, d, e, f] = createLayerGeometryIndex(page).worldMatrix(layer.id);
  const world = new Matrix3().set(a, c, e, b, d, f, 0, 0, 1);
  return projection ? world.multiply(new Matrix3().fromArray(projection).invert()) : world;
}

export function historyUvTransform(toComposition: Matrix3, bounds: Bounds, capture: Bounds) {
  const fromUv = new Matrix3().set(
    bounds.width,
    0,
    bounds.x,
    0,
    -bounds.height,
    bounds.y + bounds.height,
    0,
    0,
    1,
  );
  const toUv = new Matrix3().set(
    1 / capture.width,
    0,
    -capture.x / capture.width,
    0,
    -1 / capture.height,
    1 + capture.y / capture.height,
    0,
    0,
    1,
  );
  return toUv.multiply(toComposition).multiply(fromUv).elements;
}

export function historicalEffectBounds(
  page: Composition,
  layer: Layer,
  history: EffectAuxiliaryInputs["history"],
  projection?: readonly number[],
): Bounds | undefined {
  const inverse = effectToComposition(page, layer, projection).invert();
  const points = layer.effects.flatMap((effect) =>
    (effect.type === "trail" && !resolveEffectSettings(effect).expandBounds
      ? []
      : (history?.get(effect.id) ?? [])
    ).flatMap((input) =>
      input.available && input.ownerBounds ? finiteProjectedPoints(input.ownerBounds, inverse) : [],
    ),
  );
  if (!points.length) return undefined;
  const x = Math.min(...points.map((point) => point.x)),
    y = Math.min(...points.map((point) => point.y));
  return {
    x,
    y,
    width: Math.max(...points.map((point) => point.x)) - x,
    height: Math.max(...points.map((point) => point.y)) - y,
  };
}

function focus(effect: Effect) {
  if (!getEffectDefinition(effect.type).requirements?.depth) return undefined;
  const settings = resolveEffectSettings(effect);
  return settings.focusMode === "point"
    ? { id: effect.id, x: Number(settings.focusX), y: Number(settings.focusY) }
    : undefined;
}

/** Resolve borrowed inputs immediately before each operator draw, never during source preparation. */
export function layerEffectInputs(
  page: Composition,
  layer: Layer,
  bounds: Bounds,
  spatial: SpatialSources | null,
  history: EffectAuxiliaryInputs["history"],
  projection?: readonly number[],
): EffectAuxiliaryInputs {
  const mapped = new Map<string, readonly EffectHistoryInput[]>();
  const toComposition = effectToComposition(page, layer, projection);
  for (const effect of layer.effects) {
    const inputs = history?.get(effect.id);
    if (inputs)
      mapped.set(
        effect.id,
        inputs.map((input) => ({
          ...input,
          ...(input.captureBounds
            ? { uvTransform: historyUvTransform(toComposition, bounds, input.captureBounds) }
            : {}),
        })),
      );
  }
  return {
    scope: "layer",
    history: mapped,
    depthForEffect: (effect) =>
      getEffectDefinition(effect.type).requirements?.depth
        ? (spatial?.layerDepth(layer.id, bounds, focus(effect), projection) ?? undefined)
        : undefined,
  };
}

export function compositionDepthInputs(
  spatial: SpatialSources | null,
): Pick<EffectAuxiliaryInputs, "depthForEffect"> {
  return {
    depthForEffect: (effect) =>
      getEffectDefinition(effect.type).requirements?.depth
        ? (spatial?.compositionDepth(focus(effect)) ?? undefined)
        : undefined,
  };
}
