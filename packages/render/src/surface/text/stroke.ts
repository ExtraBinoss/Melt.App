import { Fn, If, attribute, max, varying, vec2, vec4 } from "three/tsl";
import type { Node } from "three/webgpu";
import type { CurveAtlas } from "./atlas";
import type { textPaint } from "./paint";
import { glyphCoverage } from "./coverage";

/** Expanded analytical coverage stays in font coordinates; fill-only text never builds this graph. */
export function strokedTextNode(
  atlas: CurveAtlas,
  coordinate: Node<"vec2">,
  paint: Node<"vec4">,
  coverage: Node<"float">,
  controls: ReturnType<typeof textPaint>,
) {
  const scale = varying(
    attribute("glyphBounds", "vec4").zw.div(attribute("glyphPosition", "vec4").zw),
  );
  return Fn(() => {
    const fillCoverage = coverage.toVar(),
      fillAlpha = paint.a.mul(fillCoverage).toVar(),
      result = vec4(paint.rgb, fillAlpha).toVar();
    // A uniform branch keeps zero-width resets exact and skips all expanded samples.
    If(controls.strokeWidth.greaterThan(0), () => {
      let expanded: Node<"float"> = fillCoverage;
      for (let index = 0; index < 16; index++) {
        const angle = (index * Math.PI * 2) / 16;
        const offset = vec2(Math.cos(angle), Math.sin(angle)).mul(controls.strokeWidth).mul(scale);
        expanded = max(expanded, glyphCoverage(atlas.texture, atlas.width, coordinate.add(offset)));
      }
      const strokeAlpha = expanded.mul(fillCoverage.oneMinus()).mul(controls.stroke.a),
        alpha = fillAlpha.add(strokeAlpha),
        color = paint.rgb
          .mul(fillAlpha)
          .add(controls.stroke.rgb.mul(strokeAlpha))
          .div(max(alpha, 0.000001));
      result.assign(vec4(color, alpha));
    });
    return result;
  })();
}
