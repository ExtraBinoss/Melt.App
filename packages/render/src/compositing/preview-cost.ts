import { hasEffectTreatment } from "../effects/shared/active";
import {
  ASCII_DEFAULT_CHARACTERS,
  backgroundLayer,
  createLayerGeometryIndex,
  effectAssetIds,
  getEffectDefinition,
  isImageAsset,
  resolveEffectSettings,
  resolveGradientSettings,
  type Asset,
  type Bounds,
  type Composition,
  type Layer,
} from "@musart/core";
import { isInstancedPrimitive } from "./primitives/eligibility";
import {
  BASE_GEOMETRY_BYTES,
  INSTANCE_BYTES,
  MAX_PRIMITIVE_INSTANCES,
  primitiveCapacity,
} from "./primitives/attributes";
import { groupViewport } from "./group-viewport";
import { effectStages } from "../effects/pipeline";
import { effectFootprint } from "../effects/shared/footprint";
import { rasterExtent } from "./types";
import { maskLayerMapping } from "./mask-binding";
import { PRINT_PROOF_BYTES } from "../color/proof/table";
import { spatialPreviewExtents } from "./spatial-preview-extent";

export interface PreviewCost {
  readonly bytes: number;
  readonly originalBytes: number;
  readonly targetBytes: number;
  readonly fixedBytes: number;
  readonly scaledBytes: number;
  readonly maxDimension: number;
}
/** Estimated current-frame targets. The hard GPU cache still admits retained/in-flight resources. */
export function estimatePreviewCost(
  page: Composition,
  scale: number,
  assets: Record<string, Asset> = {},
  vectorAntialias = false,
  viewport?: Bounds,
): PreviewCost {
  if (!Number.isFinite(scale) || scale <= 0) throw new RangeError("Invalid preview density.");
  const rootWidth = viewport?.width ?? page.width,
    rootHeight = viewport?.height ?? page.height;
  const backgroundId = backgroundLayer(page, Boolean(viewport))?.id;
  const geometry = createLayerGeometryIndex(page),
    spatialExtent = spatialPreviewExtents(page, viewport),
    seen = new Set<string>(),
    originals = new Set<string>();
  let originalBytes = 0,
    fixedBytes = 0,
    scaledBytes = 0,
    maxDimension = 0,
    primitiveCount = 0,
    scratch = 0,
    backdrop = 0;
  function target(width: number, height: number, fixed: boolean, mip = false, samples = 0) {
    maxDimension = Math.max(maxDimension, width, height);
    let pixels = width * height * (samples > 1 ? samples + 1 : 1);
    while (mip && (width > 1 || height > 1)) {
      width = Math.max(1, Math.floor(width / 2));
      height = Math.max(1, Math.floor(height / 2));
      pixels += width * height;
    }
    if (fixed) fixedBytes += pixels * 4;
    else scaledBytes += pixels * 4;
  }
  function children(
    parentId: string | null,
    width: number,
    height: number,
    density: number,
    fixed: boolean,
    window?: ReturnType<typeof groupViewport>,
  ) {
    const w = window?.pixelWidth ?? rasterExtent(width, density),
      h = window?.pixelHeight ?? rasterExtent(height, density);
    target(w, h, fixed);
    const list = window?.empty
      ? []
      : geometry.children(parentId).filter((l) => l.visible && l.opacity > 0 && !l.maskSource);
    if (list.some((l) => l.blendMode !== "normal")) target(w, h, fixed);
    const bounds = window?.bounds ?? { x: 0, y: 0, width, height };
    for (const l of list) {
      if (isInstancedPrimitive(l) && l.id !== backgroundId) {
        primitiveCount++;
        continue;
      }
      layer(l, density, fixed, bounds);
    }
  }
  function layer(l: Layer, density: number, fixed: boolean, parent?: Bounds) {
    const continued = l.id === backgroundId;
    const reference = l.effects.some(hasEffectTreatment) || !!l.mask?.enabled || !!l.clipping;
    if (reference && !continued) {
      density = 1;
      fixed = true;
    }
    const window = l.kind === "group" && !reference ? groupViewport(l, density, parent) : null;
    const key = `${l.id}:${density}:${window?.key ?? "full"}:${vectorAntialias && !fixed}`;
    if (seen.has(key)) return;
    seen.add(key);
    const width = continued ? rootWidth : l.width,
      height = continued ? rootHeight : l.height;
    let w = rasterExtent(width, density),
      h = rasterExtent(height, density);
    if (l.kind === "group") children(l.id, l.width, l.height, density, fixed, window);
    else if (l.spatial?.enabled) {
      const extent = spatialExtent(l);
      const nativeWidth = rasterExtent(extent.width, density),
        nativeHeight = rasterExtent(extent.height, density);
      maxDimension = Math.max(maxDimension, nativeWidth, nativeHeight);
      if (fixed) fixedBytes += nativeWidth * nativeHeight * 60;
      else scaledBytes += nativeWidth * nativeHeight * 60;
    } else if (l.kind !== "image" && l.kind !== "video")
      target(w, h, fixed, false, vectorAntialias && !fixed && l.kind === "vector" ? 4 : 0);
    else {
      const asset = l.assetId ? assets[l.assetId] : undefined;
      const sourceKey = l.kind === "video" ? `video:${l.id}` : `image:${asset?.id}`;
      if (asset && asset.kind !== "audio" && !originals.has(sourceKey)) {
        originals.add(sourceKey);
        originalBytes += asset.width * asset.height * 4 * (l.kind === "video" ? 4 : 1);
        maxDimension = Math.max(maxDimension, asset.width, asset.height);
      }
      if (l.radius > 0) target(w, h, fixed);
      if (page.colorSpace === "display-p3") target(w, h, fixed);
    }
    const effects = l.effects.filter(hasEffectTreatment);
    if (effects.length) {
      const footprint = effectFootprint(effects);
      const expanded = footprint.left || footprint.right || footprint.top || footprint.bottom;
      w = rasterExtent(width + footprint.left + footprint.right, density);
      h = rasterExtent(height + footprint.top + footprint.bottom, density);
      if (expanded || continued || l.kind === "group" || l.kind === "text" || l.kind === "vector")
        target(w, h, fixed);
      target(w, h, fixed);
      const stages = effects.reduce((n, effect) => n + effectStages(effect).length, 0);
      if (stages > 1) scratch = Math.max(scratch, w * h * 4);
      if (effects.some((effect) => effectStages(effect).length > 1))
        backdrop = Math.max(backdrop, w * h * 4);
    }
    if (l.mask?.enabled) {
      target(w, h, fixed);
      if (l.mask.assetId) {
        const asset = assets[l.mask.assetId];
        const key = asset?.kind === "video" ? `video-mask:${l.id}` : `image:${asset?.id}`;
        if (asset && asset.kind !== "audio" && !originals.has(key)) {
          originals.add(key);
          originalBytes += asset.width * asset.height * 4 * (asset.kind === "video" ? 4 : 1);
          maxDimension = Math.max(maxDimension, asset.width, asset.height);
        }
      }
      if (l.mask.layerId) {
        const source = geometry.byId.get(l.mask.layerId);
        if (source && maskLayerMapping(page, l, source, false).opacity > 0)
          layer(source, density, fixed);
      }
    }
    if (l.clipping) {
      target(w, h, fixed);
      const base = geometry.byId.get(l.clipping.layerId);
      if (base?.visible && base.opacity > 0) layer(base, density, fixed);
    }
    if (reference) target(w, h, fixed, true);
  }
  children(
    null,
    rootWidth,
    rootHeight,
    scale,
    false,
    viewport
      ? {
          bounds: viewport,
          pixelWidth: rasterExtent(rootWidth, scale),
          pixelHeight: rasterExtent(rootHeight, scale),
          key: "display",
          empty: false,
        }
      : undefined,
  );
  target(rasterExtent(rootWidth, scale), rasterExtent(rootHeight, scale), false);
  // A front/back pair keeps the visible texture intact until its successor is ready.
  target(rasterExtent(rootWidth, scale), rasterExtent(rootHeight, scale), false);
  if (primitiveCount)
    fixedBytes +=
      BASE_GEOMETRY_BYTES +
      primitiveCapacity(Math.min(primitiveCount, MAX_PRIMITIVE_INSTANCES)) * INSTANCE_BYTES;
  // Shared effect scratch/backdrop are high-water resources, not one pair per layer.
  let sharedFixed = scratch + backdrop,
    sharedScaled = 0;
  if (page.effects?.length) {
    const effects = page.effects.filter(hasEffectTreatment);
    if (effects.length) {
      const w = rasterExtent(rootWidth, scale),
        h = rasterExtent(rootHeight, scale);
      // Final artboard roles: straight input, effect output and premultiplied result.
      // Unlike source-local effects, this stack is clipped to the artboard gate.
      for (let index = 0; index < 3; index++) target(w, h, false);
      if (page.motion?.mode === "motion") {
        const snapshots = effects
          .filter(
            (effect) =>
              effect.type === "trail" && resolveEffectSettings(effect).mode === "temporal",
          )
          .reduce((count, effect) => count + Number(resolveEffectSettings(effect).echoCount), 0);
        if (snapshots) {
          fixedBytes += 64 * 1024 * 1024;
          scaledBytes += w * h * 8 * Math.min(32, snapshots);
        }
      }
      const blocks = effects.map(effectStages);
      const stages = blocks.reduce((count, block) => count + block.length, 0);
      const count =
        Number(stages > 1) + Number(blocks.some((block, index) => index > 0 && block.length > 1));
      // Existing fixed layer scratch serves the same shared operator. Charge only
      // the extra high-water working set at the scalable composition resolution.
      sharedScaled = Math.max(0, w * h * 4 * count - sharedFixed);
      scaledBytes += sharedScaled;
      for (const id of effectAssetIds(effects)) {
        const asset = assets[id];
        if (!asset || !isImageAsset(asset) || originals.has(`image:${id}`)) continue;
        originals.add(`image:${id}`);
        originalBytes += asset.width * asset.height * 4;
        maxDimension = Math.max(maxDimension, asset.width, asset.height);
      }
    }
    // Preparation also visits disabled effects. Their immutable uploads and 1px
    // sampler-distinction surface exist even when no final artboard pass runs.
    const prepared = [page, ...page.layers].flatMap((owner) => owner.effects ?? []);
    const atlases = new Map<string, number>();
    let needsNeutral = false;
    for (const effect of prepared) {
      const stages = effectStages(effect);
      if (!stages.length) continue;
      if (stages.length > 1 && !sharedFixed && !sharedScaled) sharedFixed = 4;
      needsNeutral ||= Boolean(getEffectDefinition(effect.type).inputs?.length);
      if (
        effect.type === "ascii" ||
        effect.type === "window-trails" ||
        (effect.type === "gradient" &&
          resolveGradientSettings(effect.settings).treatment === "ascii")
      ) {
        const characters =
          effect.type === "ascii"
            ? String(resolveEffectSettings(effect).characters)
            : ASCII_DEFAULT_CHARACTERS;
        const width = Array.from(characters).length * 16;
        atlases.set(characters, width * 16 * 4);
        maxDimension = Math.max(maxDimension, width, 16);
      }
    }
    // The operator retains at most eight immutable atlases. The largest eight
    // bound any warmup/render LRU order without multiplying a shared upload.
    fixedBytes +=
      [...atlases.values()]
        .sort((a, b) => b - a)
        .slice(0, 8)
        .reduce((sum, bytes) => sum + bytes, 0) +
      Number(needsNeutral) * 4;
  }
  fixedBytes += sharedFixed;
  if (page.colorSpace === "cmyk") fixedBytes += PRINT_PROOF_BYTES;
  const native = page.layers.filter((layer) => layer.spatial?.enabled && layer.kind !== "group");
  if (native.length) {
    fixedBytes += 40 * 1024 * 1024;
    // One shared RGBA/depth prepass follows the highest native reference density.
    const density = Math.max(
      scale,
      ...native.map((layer) =>
        layer.effects.some(hasEffectTreatment) || layer.mask?.enabled || layer.clipping ? 1 : scale,
      ),
    );
    const depthBytes = rasterExtent(rootWidth, density) * rasterExtent(rootHeight, density) * 8;
    if (density !== scale) fixedBytes += depthBytes;
    else scaledBytes += depthBytes;
  }
  return {
    bytes: originalBytes + fixedBytes + scaledBytes,
    originalBytes,
    targetBytes: fixedBytes + scaledBytes,
    fixedBytes,
    scaledBytes,
    maxDimension,
  };
}
