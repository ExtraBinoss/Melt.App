import { attribute, max, varying, vec2, vec4 } from "three/tsl";
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
  let expanded = coverage;
  for (let index = 0; index < 16; index++) {
    const angle = (index * Math.PI * 2) / 16;
    const offset = vec2(Math.cos(angle), Math.sin(angle)).mul(controls.strokeWidth).mul(scale);
    expanded = max(expanded, glyphCoverage(atlas.texture, atlas.width, coordinate.add(offset)));
  }
  const fillAlpha = paint.a.mul(coverage),
    strokeAlpha = expanded.mul(coverage.oneMinus()).mul(controls.stroke.a),
    alpha = fillAlpha.add(strokeAlpha),
    color = paint.rgb
      .mul(fillAlpha)
      .add(controls.stroke.rgb.mul(strokeAlpha))
      .div(max(alpha, 0.000001));
  return vec4(color, alpha);
}
