import { atom, createStore } from "jotai";
import { getEffectDefinition, getEffectParameter } from "@musart/core";
import type { Effect } from "@musart/core";

type Axis = "domainX" | "domainY";
/** The pad publishes scalar presentation values without React state or document writes. */
export function createPositionPresentation(effect: Effect) {
  const parameters = getEffectDefinition(effect.type).parameters;
  const x = Number(
    getEffectParameter(
      effect,
      parameters.find((p) => p.key === "domainX")!,
    ),
  );
  const y = Number(
    getEffectParameter(
      effect,
      parameters.find((p) => p.key === "domainY")!,
    ),
  );
  const position = atom({ domainX: x, domainY: y });
  const store = createStore();
  const fields = new Map<string, { read(): number; subscribe(listener: () => void): () => void }>();
  return {
    publish: (nextX: number, nextY: number) => {
      const current = store.get(position);
      if (current.domainX === nextX && current.domainY === nextY) return;
      store.set(position, { domainX: nextX, domainY: nextY });
    },
    field(axis: Axis, scale: number) {
      const key = `${axis}:${scale}`;
      let field = fields.get(key);
      if (!field) {
        field = {
          read: () => store.get(position)[axis] * scale,
          subscribe: (listener) => store.sub(position, listener),
        };
        fields.set(key, field);
      }
      return field;
    },
  };
}
