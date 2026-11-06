import type { Effect } from "../../document/model";
import { assertRecord } from "../../document/guards";
import { ensure } from "../../errors";
import { validateMotionAnimationPreset } from "../../motion/animations/validation";

/** No foreign owners, executable data or recorded events live in a direct binding. */
export function validateEffectMotion(effect: Effect, value: unknown): void {
  if (value === undefined) return;
  assertRecord(value);
  ensure(
    Object.keys(value).every((key) => key === "automatic" || key === "interactive"),
    "INVALID_DOCUMENT",
    "Invalid direct effect behavior",
  );
  const { id: _id, motion: _motion, ...definition } = effect;
  for (const key of ["automatic", "interactive"] as const) {
    const action = value[key];
    if (action === undefined) continue;
    assertRecord(action);
    ensure(
      Object.keys(action).every((field) => field === "name" || field === "channels"),
      "INVALID_DOCUMENT",
      "Invalid effect action field",
    );
    ensure(
      Array.isArray(action.channels) && action.channels.length > 0 && action.channels.length <= 2,
      "INVALID_DOCUMENT",
      "Invalid direct effect channels",
    );
    const preset = {
      version: 1,
      id: "direct-effect",
      name: action.name,
      category: "custom",
      duration: 2000,
      effects: [definition],
      channels: action.channels,
    };
    validateMotionAnimationPreset(preset);
    for (const channel of preset.channels) {
      ensure(
        (channel.target.kind === "effect" || channel.target.kind === "effectSetting") &&
          channel.target.slot === 0 &&
          !channel.unit,
        "INVALID_DOCUMENT",
        "Direct effect target must belong to its owner",
      );
      const driver = channel.driver;
      ensure(driver, "INVALID_DOCUMENT", "Direct effect action requires a driver");
      ensure(
        key === "automatic"
          ? "period" in driver
          : !("period" in driver) && driver.events.length === 0,
        "INVALID_DOCUMENT",
        "Invalid direct effect driver",
      );
    }
  }
}
