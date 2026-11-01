import { Vector4 } from "three/webgpu";
import { uniform, uniformArray } from "three/tsl";
import type { ParameterUniforms } from "../shared/parameters";

const KEYS = [
  "count",
  "ribbons",
  "entranceDelay",
  "delay",
  "speed",
  "phase",
  "centerX",
  "centerY",
  "radiusX",
  "radiusY",
  "width",
  "height",
  "fade",
  "path",
] as const;
export const MAX_WINDOW_TRAILS = 96;

/** Prepare at most 96 rectangles once per pose, rather than evaluating their paths per pixel.
 * Only coordinates cross the CPU/GPU boundary. Source pixels and treatments remain GPU-only. */
export function createWindowTrailsLayout() {
  const rectangles = Array.from({ length: MAX_WINDOW_TRAILS }, () => new Vector4());
  const windows = uniformArray<"vec4">(rectangles, "vec4");
  const bounds = uniform(new Vector4());
  const count = uniform(0, "int");
  const previous = new Float64Array(KEYS.length + 3).fill(NaN);
  return {
    rectangles,
    windows,
    bounds,
    count,
    update(
      parameters: ParameterUniforms["parameters"],
      time: number,
      width: number,
      height: number,
    ): boolean {
      let changed = time !== previous[0] || width !== previous[1] || height !== previous[2];
      previous[0] = time;
      previous[1] = width;
      previous[2] = height;
      for (let i = 0; i < KEYS.length; i++) {
        const value = parameters[KEYS[i]!]!.value;
        if (value !== previous[i + 3]) changed = true;
        previous[i + 3] = value;
      }
      if (!changed) return false;
      const u = (key: (typeof KEYS)[number]) => parameters[key]!.value;
      const copies = Math.max(1, Math.min(32, Math.trunc(u("count"))));
      const ribbons = Math.max(1, Math.min(3, Math.trunc(u("ribbons"))));
      const w = Math.max(24, u("width")),
        h = Math.max(24, u("height"));
      const cx = u("centerX") * width,
        cy = u("centerY") * height;
      const rx = u("radiusX") * width,
        ry = u("radiusY") * height;
      let active = 0,
        left = Infinity,
        top = Infinity,
        right = -Infinity,
        bottom = -Infinity;
      for (let age = 0; age < copies; age++)
        for (let ribbon = 0; ribbon < ribbons; ribbon++) {
          const at = time - ribbon * u("entranceDelay") - age * u("delay");
          if (at < 0) continue;
          const phase = at * u("speed") + u("phase");
          const angle = (phase + ribbon * 0.333) * Math.PI * 2;
          let x: number, y: number;
          if (u("path") > 1.5) {
            x = (phase - Math.floor(phase)) * 2 - 1;
            y = Math.sin(angle) * 0.45;
          } else if (u("path") > 0.5) {
            x = Math.cos(angle);
            y = Math.sin(angle);
          } else {
            x = Math.sin(angle);
            y = Math.sin(angle * 2) * 0.85;
          }
          x = cx + x * rx - w * 0.5;
          y = cy + y * ry - h * 0.5;
          // The role and head bit share z; alpha is w. Stable storage, no per-frame vectors.
          rectangles[active++]!.set(
            x,
            y,
            ribbon + (age === 0 ? 4 : 0),
            1 - (age / copies) * u("fade"),
          );
          left = Math.min(left, x);
          top = Math.min(top, y);
          right = Math.max(right, x + w + 12);
          bottom = Math.max(bottom, y + h + 14);
        }
      count.value = active;
      bounds.value.set(
        active ? left : 0,
        active ? top : 0,
        active ? right : 0,
        active ? bottom : 0,
      );
      return true;
    },
  };
}
