import { MAX_LIQUIFY_DABS, LIQUIFY_MODES, type Effect } from "@musart/core";
import { Vector4 } from "three/webgpu";
import { uniform, uniformArray } from "three/tsl";
export function createLiquifyUniforms() {
  const positions = Array.from({ length: MAX_LIQUIFY_DABS }, () => new Vector4());
  const brushes = Array.from({ length: MAX_LIQUIFY_DABS }, () => new Vector4());
  return {
    positions: uniformArray<"vec4">(positions, "vec4"),
    brushes: uniformArray<"vec4">(brushes, "vec4"),
    count: uniform(0, "int"),
    update(effect: Effect) {
      const dabs = effect.liquify ?? [];
      if (dabs.length > MAX_LIQUIFY_DABS) throw Error("Liquify brush capacity exceeded.");
      this.count.value = dabs.length;
      dabs.forEach((dab, i) => {
        positions[i]!.set(dab.x, dab.y, dab.dx, dab.dy);
        brushes[i]!.set(dab.radius, dab.strength, dab.hardness, LIQUIFY_MODES.indexOf(dab.mode));
      });
    },
  };
}
