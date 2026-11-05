import { authoredUv } from "../shared/coordinates";
import { Fn, clamp, floor, fract, max, mix, uv, vec2, vec4 } from "three/tsl";
import { sampleEffect, type EffectNodeContext } from "../shared/context";
import { mixEffectCoverage } from "../shared/compositing/node";

/** One texture read, stable uniforms, explicit time and no document/glyph mutation. */
export function terminalNode({ source, controls }: EffectNodeContext) {
  const original = sampleEffect(source, controls, uv());
  const processed = Fn(() => {
    const u = controls.parameters,
      progress = clamp(u.progress!, 0, 1),
      columns = max(1, floor(u.columns!)),
      rows = max(1, floor(u.rows!)),
      position = vec2(authoredUv(controls).x, authoredUv(controls).y.oneMinus()).mul(
        vec2(columns, rows),
      ),
      cell = floor(position),
      rank = cell.y.mul(columns).add(cell.x),
      count = floor(progress.mul(columns).mul(rows)),
      revealed = rank.lessThan(count).select(1, 0),
      activeRow = cell.y.equal(floor(count.div(columns))),
      activeCell = rank.equal(count),
      underline = fract(position.y).greaterThan(0.82),
      line = activeRow.and(cell.x.greaterThanEqual(count.mod(columns))),
      shape = u
        .cursor!.equal(3)
        .select(line, u.cursor!.equal(2).select(activeCell.and(underline), activeCell)),
      blink = u
        .blinkRate!.lessThanEqual(0)
        .or(fract(controls.time.mul(u.blinkRate!)).lessThan(0.5)),
      cursor = shape
        .and(blink)
        .and(u.cursor!.greaterThan(0))
        .and(progress.lessThan(1))
        .select(1, 0),
      alpha = original.a.mul(revealed),
      resultAlpha = mix(alpha, 1, cursor),
      rgb = mix(original.rgb.mul(alpha), controls.colors.cursorColor!, cursor);
    return vec4(rgb.div(max(resultAlpha, 0.000001)), resultAlpha);
  })();
  return mixEffectCoverage(original, processed, controls.amount);
}
