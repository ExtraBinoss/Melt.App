import { AMOUNT, defineEffect } from "../definition";
import { effectFields } from "../shared/fields";
const f = effectFields("depth-anythingFx");
/** Estimated relative depth is an immutable prepared input, never native camera depth. */
export const DEPTH_ANYTHING_DEFINITION = Object.freeze({
  ...defineEffect(
    "depth-anything",
    {},
    [
      AMOUNT,
      {
        ...f.number("strength", 24, 0, 96, 0.5, "px"),
        visibleWhen: { key: "view", values: ["parallax"] },
      },
      {
        ...f.number("angle", 0, -180, 180, 1, "°"),
        visibleWhen: { key: "view", values: ["parallax"] },
      },
      { ...f.number("focus", 0.5, 0, 1), visibleWhen: { key: "view", values: ["parallax"] } },
      {
        ...f.number("zoom", 1.08, 1, 1.5, 0.01),
        visibleWhen: { key: "view", values: ["parallax"] },
      },
      f.choice("view", "depth", ["parallax", "depth"]),
    ],
    "effect",
    "preserve",
    {
      identityAtZero: true,
      sdk: { direction: "angle", preferredTargets: ["amount"] },
    },
  ),
  inputs: Object.freeze([
    { key: "depth", kind: "media" as const, labelKey: "depth-anythingFx:map" },
  ]),
});
