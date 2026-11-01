import type { Node, TextureNode } from "three/webgpu";
import { abs, clamp, fract, max, sin, step, vec2, vec4 } from "three/tsl";
import { sampleEffect } from "../shared/context";
import type { EffectUniforms } from "../shared/uniforms";

export function scanCoordinate(position: Node<"vec2">, u: EffectUniforms) {
  const point = position
    .mul(u.logicalResolution)
    .sub(u.contentOrigin)
    .div(u.contentResolution)
    .toVar();
  const direction = u.parameters.direction!;
  return direction
    .lessThan(2)
    .select(
      direction.equal(0).select(point.y.oneMinus(), point.y),
      direction.equal(2).select(point.x, point.x.oneMinus()),
    );
}

/** A virtual source move also makes a still image a useful, deterministic scan subject. */
export function warpCoordinate(position: Node<"vec2">, phase: Node<"float">, u: EffectUniforms) {
  const p = u.parameters;
  const time = phase.toVar();
  const center = u.contentOrigin.add(u.contentResolution.mul(0.5)).div(u.logicalResolution);
  const drift = vec2(p.driftX!, p.driftY!.negate())
    .mul(u.contentResolution)
    .div(u.logicalResolution)
    .mul(time);
  const wave = sin(time.mul(2 * Math.PI)).mul(p.bend!);
  const bend = p.direction!.lessThan(2).select(vec2(wave, 0), vec2(0, wave));
  return position
    .sub(center)
    .div(max(0.05, time.mul(p.zoom!).add(1)))
    .add(center)
    .sub(drift)
    .add(bend);
}

export function scanSample(source: TextureNode<"vec4">, position: Node<"vec2">, u: EffectUniforms) {
  // Shared expressions must precede TSL select branches (also needed by transparent edges).
  const point = position.toVar();
  const mirror = abs(fract(point.mul(0.5)).mul(2).sub(1)).oneMinus();
  const coord = u.parameters.edge!.equal(0).select(mirror, clamp(point, 0, 1));
  const value = sampleEffect(source, u, coord);
  const inside = step(0, point.x).mul(step(point.x, 1)).mul(step(0, point.y)).mul(step(point.y, 1));
  return vec4(value.rgb, value.a.mul(u.parameters.edge!.equal(2).select(inside, 1)));
}
