import type { LayerMotionProperty, MotionPropertySchema } from "../motion/properties/model";
import { layerMotionSchema } from "../motion/properties/layer";
import { createLayer } from "../document/factories";
import { createSpatialLayer } from "../spatial/defaults";
import {
  CAMERA_MOTION_SCHEMAS,
  LIGHT_MOTION_SCHEMAS,
  ENVIRONMENT_MOTION_SCHEMAS,
} from "../motion/scene/properties";
import { getEffectDefinition } from "../effects/catalog";
import { effectMotionSchema } from "../motion/properties/effect";
import { freezeValue } from "../document/immutable";
import type { HistoryPropertyDefinition as Definition, HistoryPropertyTarget } from "./model";

// Schema readers require a compatible owner, but never read values from this instance.
const schemaLayer = createLayer("text", {
  id: "history-schema",
  spatial: createSpatialLayer(),
  fillGradient: {
    kind: "linear",
    angle: 0,
    stops: [
      { offset: 0, color: "#000000" },
      { offset: 1, color: "#ffffff" },
    ],
  },
});
const pixel = new Set([
  "x",
  "y",
  "width",
  "height",
  "strokeWidth",
  "radius",
  "fontSize",
  "letterSpacing",
]);
const degrees = new Set([
  "rotation",
  "yaw",
  "pitch",
  "fov",
  "angle",
  "fillGradient.angle",
  "backgroundGradient.angle",
  "spatial.rotationX",
  "spatial.rotationY",
  "spatial.rotationZ",
]);
const percent = new Set([
  "opacity",
  "scaleX",
  "scaleY",
  "spatial.scaleX",
  "spatial.scaleY",
  "spatial.scaleZ",
  "spatial.material.opacity",
]);
const booleans = new Set([
  "locked",
  "maskSource",
  "spatialContext",
  "vector.preserveColors",
  "vector.strokeOnly",
  "spatial.enabled",
  "spatial.castShadow",
  "spatial.receiveShadow",
  "spatial.useModelMaterials",
  "rulers",
  "shadows",
  "mute",
  "enabled",
  "inverted",
  "loop",
]);
const text = new Set([
  "name",
  "parentId",
  "assetId",
  "layerId",
  "spatial.source",
  "spatial.material.preset",
  "preset",
]);
const choices: Readonly<Record<string, readonly string[]>> = {
  "backgroundGradient.kind": ["linear", "radial"],
  "backgroundGradient.radialShape": ["ellipse", "circle"],
  colorSpace: ["srgb", "display-p3", "cmyk", "cmyk-proof"],
  "reflections.mode": ["scene", "environment"],
  "reflections.quality": ["draft", "balanced", "high"],
  axis: ["x", "y"],
  mode: ["static", "motion"],
  easing: ["linear", "hold", "cubicBezier", "spring"],
};
function fromSchema(schema: MotionPropertySchema): Pick<Definition, "kind" | "options"> {
  return schema.kind === "choice"
    ? { kind: "choice", options: schema.options }
    : {
        kind:
          schema.kind === "integer" ? "number" : schema.kind === "string" ? "string" : schema.kind,
      };
}
function layerDefinition(target: HistoryPropertyTarget): Definition | null {
  const property = target.property;
  const schema = layerMotionSchema(
    property === "radius" ? { ...schemaLayer, kind: "rectangle" } : schemaLayer,
    property as LayerMotionProperty,
  );
  const source = property.startsWith("spatial.") ? "spatial" : "layer";
  const label = { source, property: source === "spatial" ? property.slice(8) : property } as const;
  if (schema)
    return {
      ...fromSchema(schema),
      label,
      ...(percent.has(property)
        ? { displayScale: 100, unit: "%" as const }
        : degrees.has(property)
          ? { unit: "°" as const }
          : pixel.has(property)
            ? { unit: "px" as const }
            : property === "spatial.clipTime"
              ? { unit: "s" as const }
              : {}),
    };
  if (/^fillGradient\.(centerX|centerY|radius)$/.test(property))
    return { kind: "number", label, displayScale: 100, unit: "%" };
  if (property === "fillGradient.radialShape")
    return { kind: "choice", label, options: ["ellipse", "circle"] };
  if (booleans.has(property)) return { kind: "boolean", label };
  if (text.has(property)) return { kind: "string", label };
  if (/^(affine\.[0-3]|(margin|padding)\.(top|right|bottom|left))$/.test(property))
    return { kind: "number", label, ...(property.startsWith("affine.") ? {} : { unit: "px" }) };
  return null;
}
function effectDefinition(
  target: Extract<HistoryPropertyTarget, { owner: { kind: "effect" } }>,
): Definition | null {
  const { owner, property } = target;
  if (property.startsWith("inputs.")) {
    const key = property.slice(7);
    if (!getEffectDefinition(owner.effectType).inputs?.some((input) => input.key === key))
      return null;
    return {
      kind: "string",
      label: { source: "effect", property, effectType: owner.effectType, scope: "input", key },
    };
  }
  const settings = property.startsWith("settings."),
    key = settings ? property.slice(9) : property;
  const definition = getEffectDefinition(owner.effectType);
  const parameter = definition.parameters.find(
    (item) => item.key === key && (item.scope === "settings") === settings,
  );
  const schema = effectMotionSchema(
    { id: owner.effectId, type: owner.effectType, ...definition.defaults },
    key,
    settings,
  );
  if (!schema && !parameter) return null;
  const label = {
    source: "effect",
    property,
    effectType: owner.effectType,
    scope: settings ? "settings" : "root",
    key,
  } as const;
  if (parameter)
    return {
      kind:
        parameter.kind === "select"
          ? "choice"
          : parameter.kind === "text"
            ? "string"
            : parameter.kind,
      label,
      ...(parameter.kind === "number"
        ? {
            displayScale: parameter.displayScale,
            ...(parameter.unit ? { unit: parameter.unit as NonNullable<Definition["unit"]> } : {}),
          }
        : {}),
      ...(parameter.kind === "select"
        ? {
            options: parameter.options.map((option) => option.value),
            choiceLabels: parameter.options,
          }
        : {}),
    };
  return {
    ...fromSchema(schema!),
    label,
    ...(["amount", "opacity"].includes(key) ? { displayScale: 100, unit: "%" } : {}),
  };
}
function sceneDefinition(target: HistoryPropertyTarget): Definition | null {
  const { owner, property } = target;
  const schemas =
    owner.kind === "camera"
      ? CAMERA_MOTION_SCHEMAS
      : owner.kind === "light"
        ? LIGHT_MOTION_SCHEMAS
        : ENVIRONMENT_MOTION_SCHEMAS;
  const schema = (schemas as Readonly<Record<string, MotionPropertySchema>>)[property];
  const label = { source: "scene", property } as const;
  if (schema)
    return { ...fromSchema(schema), label, ...(degrees.has(property) ? { unit: "°" } : {}) };
  return owner.kind === "environment" && ["preset", "assetId"].includes(property)
    ? { kind: "string", label }
    : null;
}
/** Pure lookup: identity/type metadata suffice even after the edited object was deleted. */
export function getHistoryPropertyDefinition(target: HistoryPropertyTarget): Definition | null {
  const { owner, property } = target;
  let result: Definition | null;
  if (owner.kind === "layer") result = layerDefinition(target);
  else if (owner.kind === "effect")
    result = effectDefinition(
      target as Extract<HistoryPropertyTarget, { owner: { kind: "effect" } }>,
    );
  else if (owner.kind === "camera" || owner.kind === "light" || owner.kind === "environment")
    result = sceneDefinition(target);
  else {
    const label = { source: owner.kind, property } as Definition["label"];
    const time = [
      "start",
      "end",
      "sourceIn",
      "duration",
      "time",
      "fadeIn",
      "fadeOut",
      "reverb.decay",
    ].includes(property);
    result = {
      kind:
        property === "background" ||
        property === "color" ||
        /^backgroundGradient\.stops\.\d+\.color$/.test(property)
          ? "color"
          : booleans.has(property)
            ? "boolean"
            : text.has(property)
              ? "string"
              : choices[property]
                ? "choice"
                : property === "value"
                  ? "string"
                  : "number",
      label,
      ...(choices[property]
        ? {
            options:
              owner.kind === "mask" && property === "mode"
                ? ["alpha", "luminance"]
                : choices[property],
          }
        : {}),
      ...(time
        ? { unit: "s" }
        : property === "volume" || property === "strength" || property === "reverb.mix"
          ? { displayScale: 100, unit: "%" }
          : /^backgroundGradient\.(centerX|centerY|radius)$/.test(property) ||
              /^backgroundGradient\.stops\.\d+\.offset$/.test(property)
            ? { displayScale: 100, unit: "%" }
            : property === "backgroundGradient.angle"
              ? { unit: "°" }
              : ["width", "height", "position"].includes(property) ||
                  property.startsWith("margins.") ||
                  property.startsWith("canvasPosition.")
                ? { unit: "px" }
                : {}),
    };
  }
  return result ? freezeValue(result) : null;
}
