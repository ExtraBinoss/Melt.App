import type { Node } from "three/webgpu";
import { clamp, cos, dot, mix, sin, smoothstep, uv, vec2, vec3, vec4 } from "three/tsl";
import { finishGlow, glowAxis, originalContext, straightColor } from "../glow/node";
import type { EffectNodeContext } from "../shared/context";
import { authoredPixelDown } from "../shared/coordinates";
import { samplePremultiplied } from "../shared/premultiplied-sample";

function rotate(position: Node<"vec2">, angle: Node<"float">) {
  return vec2(
    cos(angle).mul(position.x).sub(sin(angle).mul(position.y)),
    sin(angle).mul(position.x).add(cos(angle).mul(position.y)),
  );
}

/** Continuous liquid domain in owner pixels; phase is authored, never wall-clock time. */
export function neonMeltTreatment(context: EffectNodeContext) {
  const u = context.controls.parameters,
    angle = u.direction!.mul(Math.PI / 180),
    p = rotate(authoredPixelDown(context.controls).div(u.liquidScale!), angle.negate()),
    phase = u.phase!,
    flow = vec2(
      sin(
        p.y
          .mul(2.3)
          .add(phase)
          .add(cos(p.x.mul(1.7).sub(phase)).mul(0.8)),
      ),
      cos(
        p.x
          .mul(2.1)
          .sub(phase)
          .add(sin(p.y.mul(1.3).add(phase)).mul(0.8)),
      ),
    ),
    displacement = rotate(flow, angle).mul(u.distortion!),
    position = uv().add(
      vec2(displacement.x, displacement.y.negate()).div(context.controls.logicalResolution),
    ),
    sample = straightColor(samplePremultiplied(context, position)),
    luminance = dot(sample.rgb, vec3(0.2126, 0.7152, 0.0722)),
    tone = clamp(luminance.sub(0.5).mul(u.contrast!).add(0.5).add(u.paletteShift!), 0, 1);
  const ramp = (a: Node<"vec3">, b: Node<"vec3">, c: Node<"vec3">, d: Node<"vec3">) =>
    mix(
      mix(a, b, smoothstep(0, 0.34, tone)),
      mix(c, d, smoothstep(0.66, 1, tone)),
      smoothstep(0.34, 0.66, tone),
    );
  const acid = ramp(
      vec3(0.025, 0.005, 0.09),
      vec3(0.8, 0.01, 0.6),
      vec3(0.1, 1, 0.35),
      vec3(1, 1, 0.35),
    ),
    spectral = ramp(
      vec3(0.02, 0.01, 0.15),
      vec3(0.1, 0.1, 1),
      vec3(1, 0.05, 0.1),
      vec3(1, 0.95, 0.5),
    ),
    ultraviolet = ramp(
      vec3(0.015, 0, 0.05),
      vec3(0.3, 0.02, 0.9),
      vec3(1, 0.08, 0.65),
      vec3(0.5, 1, 1),
    ),
    palette = mix(
      mix(acid, spectral, u.palette!.equal(1).select(1, 0)),
      ultraviolet,
      u.palette!.equal(2).select(1, 0),
    );
  return vec4(palette, sample.a);
}

export function neonMeltPrepareNode(context: EffectNodeContext) {
  return neonMeltTreatment(context);
}
export function neonMeltNode(context: EffectNodeContext) {
  return finishGlow(
    context,
    glowAxis(context, "y", false),
    neonMeltTreatment(originalContext(context)),
  );
}
