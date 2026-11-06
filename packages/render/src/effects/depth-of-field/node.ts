import type { Node } from "three/webgpu";
import {
  Fn,
  If,
  clamp,
  cos,
  float,
  max,
  mix,
  mod,
  sin,
  smoothstep,
  uv,
  vec2,
  vec3,
  vec4,
} from "three/tsl";
import { sampleEffect, type EffectNodeContext } from "../shared/context";

/** Convert normalized native camera depth to positive camera-space distance. */
export function cameraDepthDistance(
  raw: Node<"float">,
  near: Node<"float">,
  far: Node<"float">,
  perspective: Node<"float">,
) {
  const orthographic = near.add(raw.mul(far.sub(near))),
    projective = near.mul(far).div(max(far.sub(raw.mul(far.sub(near))), 0.000001));
  return mix(orthographic, projective, perspective);
}

/** Native-depth gather: 25 color taps, 25 depth taps, no estimated or synthetic depth. */
export function depthOfFieldNode({ source, controls, bindDepthInput }: EffectNodeContext) {
  if (!bindDepthInput) throw Error("Depth of field requires the native camera depth port");
  const binding = bindDepthInput(),
    u = controls.parameters,
    position = uv(),
    original = sampleEffect(source, controls, position);
  const result = Fn(() => {
    // Source UVs can be expanded, cropped, transformed or reprojected into an
    // authored native face. Borrowed depth always belongs to its actual camera gate.
    const distance = (coord: Node<"vec2">) => {
        const mapped = binding.uvTransform.mul(vec3(coord, 1)),
          depthUv = mapped.xy.div(mapped.z),
          inside = depthUv.x
            .greaterThanEqual(0)
            .and(depthUv.x.lessThanEqual(1))
            .and(depthUv.y.greaterThanEqual(0))
            .and(depthUv.y.lessThanEqual(1)),
          raw = inside.select(binding.texture.sample(clamp(depthUv, 0, 1)).r, float(1));
        return cameraDepthDistance(raw, binding.near, binding.far, binding.perspective);
      },
      centerDepth = distance(position).toVar(),
      focus = mix(
        u.focusDistance!,
        cameraDepthDistance(
          binding.focusTexture.sample(vec2(0.5)).r,
          binding.near,
          binding.far,
          binding.perspective,
        ),
        u.focusMode!.mul(binding.focusPresent),
      ),
      difference = max(centerDepth.sub(focus).abs().sub(u.focusRange!), 0),
      radius = clamp(
        difference.div(max(centerDepth, 0.000001)).mul(float(4).div(u.aperture!)),
        0,
        1,
      )
        .mul(u.maxBlur!)
        .toVar(),
      apertureAngle = u.angle!.mul(Math.PI / 180),
      sector = float(Math.PI * 2).div(u.blades!),
      tolerance = centerDepth.mul(0.03).add(u.focusRange!).add(0.001),
      count = u.quality!.mul(8).add(8),
      sum = vec4(original.rgb.mul(original.a), original.a).toVar();
    for (let index = 0; index < 24; index++) {
      If(float(index).lessThan(count), () => {
        const theta = index * Math.PI * (3 - Math.sqrt(5)),
          disk = float(index + 0.5)
            .div(count)
            .sqrt(),
          polygon = cos(float(Math.PI).div(u.blades!)).div(
            cos(mod(float(theta).add(sector.mul(0.5)), sector).sub(sector.mul(0.5))),
          ),
          direction = float(theta).add(apertureAngle),
          offset = vec2(cos(direction), sin(direction)).mul(disk).mul(polygon).mul(radius),
          coord = clamp(position.add(offset.div(controls.logicalResolution)), 0, 1),
          sample = sampleEffect(source, controls, coord).toVar(),
          sampleDepth = distance(coord),
          depthWeight = smoothstep(
            tolerance,
            tolerance.mul(4),
            sampleDepth.sub(centerDepth).abs(),
          ).oneMinus(),
          weight = mix(1, depthWeight, u.edgeProtection!);
        sum.addAssign(vec4(sample.rgb.mul(sample.a), sample.a).mul(weight));
      });
    }
    return sum.rgb.div(max(sum.a, 0.000001));
  })();
  return vec4(mix(original.rgb, result, controls.amount.mul(binding.available)), original.a);
}
