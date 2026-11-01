import { AMOUNT, defineEffect } from "../definition";
import { effectFields } from "../shared/fields";

const f = effectFields("terminalFx");
/** A source-agnostic cell reveal: two progress points can type a whole screen. */
export const TERMINAL_DEFINITION = defineEffect(
  "terminal",
  { time: 0 },
  [
    AMOUNT,
    f.number("progress", 1, 0, 1),
    { ...f.number("columns", 24, 1, 160, 1), integer: true },
    { ...f.number("rows", 1, 1, 64, 1), integer: true },
    f.choice("cursor", "block", ["none", "block", "underline", "line"]),
    f.color("cursorColor", "#20FF08"),
    f.number("blinkRate", 0, 0, 8, 0.1, "Hz"),
    {
      kind: "number",
      key: "time",
      labelKey: "terminalFx:parameter.time",
      min: 0,
      max: 86400,
      step: 0.01,
      displayScale: 1,
      unit: "s",
    },
  ],
  "effect",
  "expand",
  { identityAtZero: true },
);
