import type { Node } from "three/webgpu";
import {
  clamp,
  cos,
  dot,
  max,
  mix,
  normalize,
  pow,
  sin,
  step,
  uv,
  vec2,
  vec3,
  vec4,
} from "three/tsl";
import { sampleEffect, type EffectNodeContext } from "../shared/context";
import { embossCavity, embossProfile } from "./profile";

/** Fixed 25-tap, GPU-only height field. Sizes are authored pixels, independent of raster
 * density. No scene geometry, random state, resources or expanded coverage are created. */
export function embossNode({ source, controls }: EffectNodeContext) {
  const u = controls.parameters,
    p = uv(),
    original = sampleEffect(source, controls, p),
    radius = u.size!.mul(u.softness!.mul(0.9).add(0.1)),
    blurStep = vec2(radius, radius).div(controls.logicalResolution),
    slopeStep = vec2(u.size!, u.size!).mul(0.5).div(controls.logicalResolution);

  const heightAt = (q: Node<"vec2">) => {
    const sample = sampleEffect(source, controls, q),
      inside = step(0, q.x).mul(step(0, q.y)).mul(step(q.x, 1)).mul(step(q.y, 1)),
      luminance = dot(sample.rgb, vec3(0.2126, 0.7152, 0.0722)).mul(sample.a);
    return clamp(mix(luminance, sample.a, u.height!).mul(inside), 0, 1);
  };
  const smoothHeight = (q: Node<"vec2">) =>
    heightAt(q)
      .mul(0.4)
      .add(heightAt(q.add(vec2(blurStep.x, 0))).mul(0.15))
      .add(heightAt(q.sub(vec2(blurStep.x, 0))).mul(0.15))
      .add(heightAt(q.add(vec2(0, blurStep.y))).mul(0.15))
      .add(heightAt(q.sub(vec2(0, blurStep.y))).mul(0.15));
  const profileAt = (q: Node<"vec2">) => embossProfile(smoothHeight(q), u.mode!),
    // Native azimuth and the image height gradient share document Y-down coordinates.
    gradient = vec2(
      profileAt(p.add(vec2(slopeStep.x, 0))).sub(profileAt(p.sub(vec2(slopeStep.x, 0)))),
      profileAt(p.sub(vec2(0, slopeStep.y))).sub(profileAt(p.add(vec2(0, slopeStep.y)))),
    ).mul(u.depth!),
    normal = normalize(vec3(gradient.x.negate(), gradient.y.negate(), 1)),
    angle = u.azimuth!.mul(Math.PI / 180),
    elevation = u.altitude!.mul(Math.PI / 180),
    light = vec3(cos(angle).mul(cos(elevation)), sin(angle).mul(cos(elevation)), sin(elevation)),
    diffuse = dot(normal, light).sub(sin(elevation)),
    edge = clamp(dot(gradient, gradient).mul(4), 0, 1),
    shine = pow(max(0, dot(normal, normalize(light.add(vec3(0, 0, 1))))), u.gloss!).mul(edge),
    material = mix(original.rgb, controls.colors.materialColor!, u.material!),
    cavity = embossCavity(smoothHeight(p), u.mode!).mul(u.depth!).mul(0.012),
    ambient = u.ambient!.add(u.ambient!.oneMinus().mul(normal.z)),
    lit = material
      .mul(ambient)
      .add(vec3(max(0, diffuse).add(shine.mul(0.35))).mul(u.highlight!))
      .sub(material.mul(max(0, diffuse.negate()).add(cavity)).mul(u.shadow!));

  // Shared domain/composite finishing runs after this native treatment.
  return vec4(mix(original.rgb, clamp(lit, 0, 1), controls.amount), original.a);
}
