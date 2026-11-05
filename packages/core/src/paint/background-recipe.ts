import { cloneValue } from "../document/immutable";
import type { Composition, Layer } from "../document/model";
import type { CommandHandler } from "../session/context";
import { createEffect, createLayer } from "../document/factories";
import { ensure } from "../errors";
import { assertNumber, assertRecord } from "../document/guards";
import { validateFillGradient, type FillGradient } from "./gradient";
import { getBackgroundPreset } from "./background-presets";
import { reconcileMotionLayers } from "../motion/initialization";
import { pruneMotionProperties } from "../motion/structure";

export interface BackgroundPresetOptions {
  gradient?: FillGradient;
  /** Optional authored amounts; zero disables this recipe ingredient. */
  grain?: number;
  feather?: number;
}
export interface ApplyBackgroundPresetCommand {
  type: "applyBackgroundPreset";
  presetId: string;
  name?: string;
  options?: BackgroundPresetOptions;
}

/** Full-frame first root rectangles are normal layers and remain editable everywhere. */
export function backgroundLayer(page: Composition): Layer | undefined {
  const first = page.layers.find((layer) => !layer.parentId);
  return first?.kind === "rectangle" &&
    !first.spatial?.enabled &&
    first.x === 0 &&
    first.y === 0 &&
    first.width === page.width &&
    first.height === page.height &&
    first.rotation === 0 &&
    (first.scaleX ?? 1) === 1 &&
    (first.scaleY ?? 1) === 1 &&
    !first.affine &&
    !first.maskSource &&
    !first.mask &&
    !first.clipping &&
    first.radius === 0
    ? first
    : undefined;
}
function validateOptions(value: BackgroundPresetOptions): void {
  assertRecord(value);
  ensure(
    Object.keys(value).every((key) => ["gradient", "grain", "feather"].includes(key)),
    "INVALID_COMMAND",
    "Unknown background preset option",
  );
  if (value.gradient !== undefined) validateFillGradient(value.gradient);
  for (const key of ["grain", "feather"] as const)
    if (value[key] !== undefined) assertNumber(value[key], 0, 1);
}

/** Renderer-free recipe shared by native previews and the validated headless command. */
export function backgroundPresetLayer(
  page: Composition,
  presetId: string,
  nextId: (prefix: string) => string,
  options: BackgroundPresetOptions = {},
  name = "Background",
): Layer {
  validateOptions(options);
  const preset = getBackgroundPreset(presetId);
  const existing = backgroundLayer(page);
  ensure(!existing?.locked, "INVALID_COMMAND", "Background layer is locked");
  const effects = preset.effects.map((ingredient) => ({ ...ingredient }));
  for (const type of ["grain", "feather"] as const) {
    const amount = options[type];
    if (amount === undefined) continue;
    const at = effects.findIndex((effect) => effect.type === type);
    if (at >= 0) effects.splice(at, 1);
    if (amount > 0) effects.push({ type, amount, scale: type === "grain" ? 1.2 : 2 });
  }
  const fillGradient = cloneValue(options.gradient ?? preset.gradient);
  return createLayer("rectangle", {
    ...existing,
    id: existing?.id ?? nextId("background"),
    name: existing?.name ?? name,
    x: 0,
    y: 0,
    width: page.width,
    height: page.height,
    fill: fillGradient.stops[0]!.color,
    fillGradient,
    effects: effects.map((effect) =>
      createEffect(effect.type, { ...effect, id: nextId("effect") }),
    ),
  });
}

export const applyBackgroundPreset: CommandHandler<"applyBackgroundPreset"> = (
  { page, pageId, project, nextId },
  command,
) => {
  const before = new Set(page.layers.map((layer) => layer.id));
  const layer = backgroundPresetLayer(
    page,
    command.presetId,
    nextId,
    command.options,
    command.name,
  );
  const existing = backgroundLayer(page);
  page.layers = existing
    ? page.layers.map((item) => (item.id === existing.id ? layer : item))
    : [layer, ...page.layers];
  // The recipe replaces the background paint. Keeping its previous gradient
  // underneath makes resizing or feathering the new rectangle reveal a second fill.
  page.background = "#00000000";
  delete page.backgroundGradient;
  // Normal motion ownership is reconciled once; evaluating or hovering never authors keys.
  if (page.motion) {
    reconcileMotionLayers(page, nextId, before, project.assets);
    pruneMotionProperties(page);
  }
  return { pageId };
};
