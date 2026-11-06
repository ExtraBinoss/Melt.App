import type { Composition, Effect } from "../../document/model";
import type { MotionValue } from "../../motion/properties/model";
import { evaluateAnimations } from "../../motion/animations/compile";
import { compileDirectEffectAction, type EffectMotionTarget } from "./compile";
import type { EffectMotionAction } from "./model";

/** A numeric live gesture offsets the automatic pose around its own neutral input. */
export function relativeEffectMotionAction(
  page: Composition,
  effect: Effect,
  interactive: EffectMotionAction,
  automatic?: EffectMotionAction,
  layerId?: string,
): EffectMotionAction {
  if (!automatic) return interactive;
  return {
    ...interactive,
    channels: interactive.channels.map((channel) => {
      if (
        channel.operation !== "replace" ||
        !channel.points.every((point) => typeof point.value === "number") ||
        !automatic.channels.some(
          (auto) =>
            auto.target.kind === channel.target.kind &&
            auto.target.property === channel.target.property &&
            (!("slot" in auto.target) ||
              ("slot" in channel.target && auto.target.slot === channel.target.slot)),
        )
      )
        return channel;
      const driver = channel.driver;
      if (!driver || "period" in driver) return channel;
      const [compiled] = compileDirectEffectAction(
        page,
        effect,
        { ...interactive, channels: [{ ...channel, driver: { ...driver, events: [] } }] },
        layerId,
      );
      const neutral = compiled!.sample({ value: 0, rate: 1 });
      if (typeof neutral !== "number") return channel;
      return {
        ...channel,
        operation: "add",
        points: channel.points.map((point) => ({ ...point, value: Number(point.value) - neutral })),
      };
    }),
  };
}
/** The interactive editor uses the exact same composition, clamping and drivers as export. */
export function compileEffectMotionPreview(
  page: Composition,
  effect: Effect,
  actions: readonly EffectMotionAction[],
  layerId?: string,
): (seconds: number) => Partial<Effect> {
  const channels = actions.flatMap((action) =>
    compileDirectEffectAction(page, effect, action, layerId),
  );
  return (seconds) => {
    const values: { target: EffectMotionTarget; value: MotionValue }[] = [];
    evaluateAnimations(
      channels,
      { value: Math.max(0, Math.round(seconds * 1000000)), rate: 1000000 },
      values,
    );
    const patch: Partial<Effect> = {};
    for (const { target, value } of values) {
      if (target.kind === "effectSetting" || target.kind === "compositionEffectSetting")
        patch.settings = { ...patch.settings, [target.property]: value };
      else Object.assign(patch, { [target.property]: value });
    }
    return patch;
  };
}
