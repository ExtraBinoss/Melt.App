import { expect, it } from "vitest";
import {
  EFFECT_CATALOG,
  SPATIAL_MOTION_SCHEMAS,
  getHistoryPropertyDefinition,
  type HistoryAction,
  type HistoryDescription,
  type HistoryPropertyTarget,
  type HistoryValue,
} from "@musart/core";
import { i18n } from "../../../../src/state/i18n";
import { supportedLocales } from "../../../../src/state/i18n/locales";
import { messages } from "../../../../src/components/notifications/history/messages";
import {
  formatHistoryDescription,
  historyPropertyLabel,
} from "../../../../src/components/notifications/history/presentation";
const layer = {
    kind: "layer",
    compositionId: "deleted-composition",
    layerId: "deleted-layer",
  } as const,
  composition = { kind: "composition", compositionId: "inactive-composition" } as const,
  audio = {
    kind: "audio",
    compositionId: "inactive-composition",
    trackId: "deleted-track",
  } as const,
  motion = { kind: "motion", compositionId: "inactive-composition", entity: "animation" } as const,
  scalar = (value: string | number | boolean): HistoryValue => ({ kind: "scalar", value }),
  t = i18n.getFixedT("en", "historyNotice");
function description(
  target: HistoryPropertyTarget,
  before: HistoryValue,
  after: HistoryValue,
): HistoryDescription {
  return { changes: [{ kind: "property", target, before, after }], additionalChanges: false };
}
const format = (target: HistoryPropertyTarget, value: string | number | boolean) =>
  formatHistoryDescription(description(target, scalar(value), scalar(value)), "undo", t);

it("names background, paints, typography, transforms, SVG flags and exact numeric restored values", () => {
  const cases: [HistoryPropertyTarget, string | number | boolean, string][] = [
    [{ owner: composition, property: "background" }, "#123456", "Background #123456"],
    [{ owner: layer, property: "fill" }, "#8b5cf6", "Fill #8b5cf6"],
    [{ owner: layer, property: "stroke" }, "#ff0000", "Stroke #ff0000"],
    [{ owner: layer, property: "strokeWidth" }, 1.25, "Stroke width 1.25px"],
    [{ owner: layer, property: "opacity" }, 0.12345, "Opacity 12.345%"],
    [{ owner: layer, property: "text" }, "Actual text", "Text Actual text"],
    [{ owner: layer, property: "fontFamily" }, "Inter", "Font family Inter"],
    [{ owner: layer, property: "fontSize" }, 21.5, "Font size 21.5px"],
    [{ owner: layer, property: "x" }, 12.75, "Position X 12.75px"],
    [{ owner: layer, property: "rotation" }, 35.25, "Rotation 35.25°"],
    [{ owner: layer, property: "scaleX" }, 1.25, "Scale X 125%"],
    [{ owner: layer, property: "fillGradient.angle" }, 15.5, "Gradient angle 15.5°"],
    [{ owner: layer, property: "fillGradient.kind" }, "radial", "Gradient type Radial"],
    [{ owner: layer, property: "textAlign" }, "right", "Text alignment Align right"],
    [{ owner: layer, property: "vector.preserveColors" }, true, "Preserve SVG colors On"],
    [{ owner: layer, property: "vector.strokeOnly" }, false, "Stroke only Off"],
    [{ owner: layer, property: "padding.left" }, 5, "Padding · Left 5px"],
    [{ owner: layer, property: "affine.0" }, 0.75, "Affine transform 1 0.75"],
  ];
  for (const [target, value, expected] of cases) expect(format(target, value)).toBe(expected);
  const change = description(
    { owner: composition, property: "background" },
    scalar("#123456"),
    scalar("#654321"),
  );
  expect(formatHistoryDescription(change, "undo", t)).toBe("Background #123456");
  expect(formatHistoryDescription(change, "redo", t)).toBe("Background #654321");
});
it("uses retained effect type and definition-owned parameter labels, units and choices", () => {
  const blur = {
    kind: "effect",
    compositionId: "gone",
    layerId: "gone",
    effectId: "gone",
    effectType: "blur",
  } as const;
  expect(format({ owner: blur, property: "amount" }, 0.57)).toBe("Blur · Amount 57%");
  expect(format({ owner: blur, property: "scale" }, 2.5)).toBe("Blur · Pattern size 2.5px");
  const ascii = { ...blur, effectType: "ascii" } as const;
  expect(format({ owner: ascii, property: "settings.gamma" }, 1.75)).toContain("1.75×");
  expect(format({ owner: ascii, property: "settings.palette" }, "tonal")).toBe(
    "ASCII · Color mode Shaded ink",
  );
});
it("names spatial pose/material, camera, light, environment, audio and Motion properties without live owners", () => {
  const cases: [HistoryPropertyTarget, string | number | boolean, string][] = [
    [{ owner: layer, property: "spatial.rotationX" }, 45, "Rotation X 45°"],
    [{ owner: layer, property: "spatial.material.roughness" }, 0.35, "Roughness 0.35"],
    [
      { owner: { kind: "camera", compositionId: "gone" }, property: "fov" },
      50,
      "Camera · Focal angle 50°",
    ],
    [
      { owner: { kind: "camera", compositionId: "gone" }, property: "projection" },
      "orthographic",
      "Camera · Projection Orthographic",
    ],
    [
      { owner: { kind: "light", compositionId: "gone", lightId: "gone" }, property: "type" },
      "spot",
      "Light · Light type Spot",
    ],
    [
      { owner: { kind: "environment", compositionId: "gone" }, property: "rotation" },
      35,
      "Environment · Rotation 35°",
    ],
    [
      { owner: { kind: "environment", compositionId: "gone" }, property: "preset" },
      "sunset",
      "Environment · Preset Sunset",
    ],
    [{ owner: audio, property: "volume" }, 0.25, "Audio · Volume 25%"],
    [{ owner: audio, property: "fadeIn" }, 0.375, "Audio · Fade in 0.375s"],
    [{ owner: audio, property: "reverb.mix" }, 0.25, "Audio · Room mix 25%"],
    [{ owner: motion, property: "strength" }, 0.75, "Animation · Intensity 75%"],
    [{ owner: motion, property: "duration" }, 1.25, "Animation · Duration 1.25s"],
    [{ owner: motion, property: "easing" }, "hold", "Animation · Easing Hold"],
  ];
  for (const [target, value, expected] of cases) expect(format(target, value)).toBe(expected);
});
it("names retained occurrence media volume and mute in every locale", () => {
  const occurrence = { ...motion, entity: "occurrence" } as const,
    volume = description({ owner: occurrence, property: "volume" }, scalar(0.25), scalar(0.75)),
    mute = description({ owner: occurrence, property: "mute" }, scalar(false), scalar(true));
  expect(formatHistoryDescription(volume, "undo", t)).toBe("Clip · Volume 25%");
  expect(formatHistoryDescription(mute, "redo", t)).toBe("Clip · Muted On");
  for (const { code } of supportedLocales) {
    const translate = i18n.getFixedT(code, "historyNotice");
    expect(formatHistoryDescription(volume, "undo", translate)).toBe(
      `${translate("occurrence")} · ${translate("volume", { ns: "motionAudio" })} 25%`,
    );
    expect(formatHistoryDescription(mute, "redo", translate)).toBe(
      `${translate("occurrence")} · ${translate("mute")} ${translate("on")}`,
    );
  }
});
it("shows missing, mixed, empty and explicitly truncated values without pretending overflow means mixed", () => {
  const target = { owner: layer, property: "text" } as const;
  expect(
    formatHistoryDescription(
      description(target, { kind: "missing" }, { kind: "mixed" }),
      "undo",
      t,
    ),
  ).toBe("Text Unset");
  expect(
    formatHistoryDescription(
      description(target, { kind: "missing" }, { kind: "mixed" }),
      "redo",
      t,
    ),
  ).toBe("Text Mixed");
  expect(format(target, "")).toBe("Text Empty");
  expect(
    formatHistoryDescription(
      description(
        target,
        { kind: "scalar", value: "😀".repeat(120), truncated: true },
        scalar("after"),
      ),
      "undo",
      t,
    ),
  ).toBe(`Text ${"😀".repeat(120)}…`);
  const change = description(
    { owner: layer, property: "fill" },
    scalar("#123456"),
    scalar("#654321"),
  );
  const compound = { ...change, changes: [...change.changes, ...change.changes] };
  expect(formatHistoryDescription(compound, "undo", t)).toBe("Fill #123456 · + 1 change");
  expect(formatHistoryDescription({ ...compound, additionalChanges: true }, "redo", t)).toBe(
    "Fill #654321 · + more changes",
  );
  expect(format({ owner: layer, property: "parentId" }, "durable-id-must-not-be-displayed")).toBe(
    "Parent Assigned",
  );
});
it("provides known structural names, keyframe context and generic compatibility only for absent/custom metadata", () => {
  const actions: HistoryAction[] = [
    "add",
    "delete",
    "duplicate",
    "reorder",
    "group",
    "ungroup",
    "align",
    "distribute",
    "geometry",
    "spatialTransform",
    "gradientStops",
    "applyTransition",
    "animationChannels",
    "assets",
    "replay",
  ];
  for (const action of actions) {
    const result = formatHistoryDescription(
      { changes: [{ kind: "action", action, owner: layer }], additionalChanges: false },
      "undo",
      t,
    );
    expect(result).not.toBe("Edit");
    expect(result).not.toContain("deleted-layer");
  }
  const change = description(
    { owner: layer, property: "opacity" },
    { kind: "missing" },
    scalar(0.25),
  );
  expect(
    formatHistoryDescription(
      {
        ...change,
        changes: [
          { ...change.changes[0]!, context: "keyframe" } as (typeof change.changes)[number],
        ],
      },
      "redo",
      t,
    ),
  ).toBe("Keyframe · Opacity 25%");
  const unknown = description(
    { owner: layer, property: "customUnknown" } as unknown as HistoryPropertyTarget,
    scalar(0),
    scalar(1),
  );
  expect(formatHistoryDescription(unknown, "undo", t)).toBe("Edit");
  expect(
    formatHistoryDescription(
      { ...change, changes: [...unknown.changes, ...change.changes] },
      "redo",
      t,
    ),
  ).toBe("Opacity 25% · + 1 change");
  expect(formatHistoryDescription(undefined, "undo", t)).toBe("Edit");
  expect(formatHistoryDescription({ changes: [], additionalChanges: false }, "redo", t)).toBe(
    "Edit",
  );
});
it("registers domain labels and choice resources explicitly for every locale and every effect parameter", () => {
  for (const { code } of supportedLocales) {
    const translate = i18n.getFixedT(code, "historyNotice");
    for (const key of Object.keys(messages.en))
      expect(
        i18n.exists(key, { lng: code, ns: "historyNotice", fallbackLng: false }),
        `${code}:${key}`,
      ).toBe(true);
    const radial = formatHistoryDescription(
      description(
        { owner: layer, property: "fillGradient.kind" },
        scalar("radial"),
        scalar("linear"),
      ),
      "undo",
      translate,
    );
    expect(radial).toContain(translate("radial", { ns: "gradient" }));
    for (const effect of Object.values(EFFECT_CATALOG))
      for (const parameter of effect.parameters) {
        const target: HistoryPropertyTarget = {
          owner: {
            kind: "effect",
            compositionId: "gone",
            layerId: "gone",
            effectId: "gone",
            effectType: effect.type,
          },
          property:
            parameter.scope === "settings"
              ? `settings.${parameter.key}`
              : (parameter.key as "amount"),
        };
        const definition = getHistoryPropertyDefinition(target)!;
        expect(historyPropertyLabel(definition, translate)).not.toContain(":");
        if (parameter.kind === "select")
          for (const option of parameter.options) {
            const result = formatHistoryDescription(
              description(target, scalar(option.value), scalar(option.value)),
              "redo",
              translate,
            );
            expect(result).toContain(translate(option.labelKey, { ns: "translation" }));
          }
      }
    for (const property of Object.keys(SPATIAL_MOTION_SCHEMAS)) {
      const definition = getHistoryPropertyDefinition({
        owner: layer,
        property,
      } as HistoryPropertyTarget)!;
      expect(historyPropertyLabel(definition, translate)).not.toContain("material.");
    }
  }
});
