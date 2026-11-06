import { abs, clamp, cos, dot, float, fract, max, mix, sin, uv, vec2, vec4 } from "three/tsl";
import { sampleEffect, type EffectNodeContext } from "../shared/context";
import { authoredPixelDown, transportUv } from "../shared/coordinates";
import { samplePremultiplied } from "../shared/premultiplied-sample";
import { mixEffectCoverage } from "../shared/compositing/node";

/** Explicit authored phase makes seeking and export independent of playback history. */
export function waveDistortionNode(context: EffectNodeContext) {
  const { controls, source } = context,
    u = controls.parameters,
    p = uv(),
    original = sampleEffect(source, controls, p),
    owner = controls.contentResolution,
    pixel = authoredPixelDown(controls, p),
    angle = u.angle!.mul(Math.PI / 180),
    direction = vec2(cos(angle), sin(angle)),
    cycles = dot(pixel, direction)
      .div(max(1, owner.x.min(owner.y)))
      .mul(u.frequency!)
      .add(u.phase!.div(360)),
    t = fract(cycles),
    sine = sin(cycles.mul(2 * Math.PI)),
    triangle = abs(t.sub(0.25).add(1).fract().mul(4).sub(2)).sub(1),
    square = t.lessThan(0.5).select(1, -1),
    sawtooth = t.mul(2).sub(1),
    wave = mix(
      mix(sine, triangle, float(u.waveform!.equal(1))),
      mix(square, sawtooth, float(u.waveform!.equal(3))),
      float(u.waveform!.greaterThanEqual(2)),
    ),
    displaced = pixel.add(vec2(direction.y.negate(), direction.x).mul(wave).mul(u.amplitude!)),
    ownerUv = displaced.div(owner),
    mirrored = fract(ownerUv.mul(0.5)).mul(2).sub(1).abs().oneMinus(),
    wrapped = mix(mirrored, fract(ownerUv), float(u.edge!.equal(2))),
    // Keep nontransparent edge taps on the final source texel, including expanded transports.
    inset = controls.pixelFootprint.div(owner).mul(0.5).min(0.5),
    bounded = clamp(mix(wrapped, ownerUv, float(u.edge!.equal(3))), inset, inset.oneMinus()),
    at = mix(ownerUv, bounded, float(u.edge!.greaterThan(0))),
    coord = transportUv(controls, vec2(at.x, at.y.oneMinus())),
    sampled = samplePremultiplied(context, coord),
    processed = vec4(sampled.rgb.div(max(sampled.a, 0.000001)), sampled.a);
  return mixEffectCoverage(
    original,
    processed,
    controls.amount.mul(u.amplitude!.greaterThan(0).select(1, 0)),
  );
}
