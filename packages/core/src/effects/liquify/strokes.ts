import { assertList, assertNumber, assertRecord } from "../../document/guards";
import { ensure } from "../../errors";
import { LIQUIFY_MODES } from "./definition";
export const MAX_LIQUIFY_DABS = 256;
/** Normalized layer-space samples; authored brush settings remain local to each dab. */
export interface LiquifyDab {
  x: number;
  y: number;
  dx: number;
  dy: number;
  radius: number;
  strength: number;
  hardness: number;
  mode: (typeof LIQUIFY_MODES)[number];
}
export function validateLiquifyDabs(value: unknown): asserts value is LiquifyDab[] {
  assertList(value, MAX_LIQUIFY_DABS);
  for (const dab of value) {
    assertRecord(dab);
    ensure(
      Object.keys(dab).every((key) =>
        ["x", "y", "dx", "dy", "radius", "strength", "hardness", "mode"].includes(key),
      ),
      "INVALID_DOCUMENT",
      "Unknown liquify brush field",
    );
    assertNumber(dab.x, -4, 5);
    assertNumber(dab.y, -4, 5);
    assertNumber(dab.dx, -4, 4);
    assertNumber(dab.dy, -4, 4);
    assertNumber(dab.radius, 0.00001, 1024);
    assertNumber(dab.strength, 0, 1);
    assertNumber(dab.hardness, 0, 0.99);
    ensure(
      LIQUIFY_MODES.includes(dab.mode as LiquifyDab["mode"]),
      "INVALID_DOCUMENT",
      "Unknown liquify brush mode",
    );
  }
}

export function sameLiquifyDabs(a: readonly LiquifyDab[] = [], b: readonly LiquifyDab[] = []) {
  return (
    a === b ||
    (a.length === b.length &&
      a.every((v, i) =>
        Object.keys(v).every((k) => v[k as keyof LiquifyDab] === b[i]![k as keyof LiquifyDab]),
      ))
  );
}
