import type { Node } from "three/webgpu";
import {
  step as edgeStep,
  clamp,
  dot,
  max,
  mix,
  normalize,
  pow,
  sin,
  cos,
  uv,
  vec2,
  vec3,
  vec4,
} from "three/tsl";
import { sampleEffect, type EffectNodeContext } from "../shared/context";
/** Fixed eight-neighbour height sampling, independent of frame rate and raster density. */
export function bevelNode({ source, controls }: EffectNodeContext) {
  const u = controls.parameters,
    c = controls.colors,
    p = uv(),
    original = sampleEffect(source, controls, p);
  const height = (q: Node<"vec2">) => {
    const s = sampleEffect(source, controls, q);
    const inside = edgeStep(0, q.x)
      .mul(edgeStep(0, q.y))
      .mul(edgeStep(q.x, 1))
      .mul(edgeStep(q.y, 1));
    return mix(s.a, dot(s.rgb, vec3(0.299, 0.587, 0.114)).mul(s.a), u.height!).mul(inside);
  };
  const step = vec2(u.size!, u.size!).div(controls.logicalResolution);
  const gradient = (spread: number) =>
    vec2(
      height(p.add(vec2(step.x.mul(spread), 0))).sub(height(p.sub(vec2(step.x.mul(spread), 0)))),
      height(p.add(vec2(0, step.y.mul(spread)))).sub(height(p.sub(vec2(0, step.y.mul(spread))))),
    );
  const g = mix(gradient(0.5), gradient(1), u.softness!)
    .mul(u.depth!)
    .mul(mix(1, -1, u.direction!));
  const normal = normalize(vec3(g.x.negate(), g.y.negate(), 1));
  const angle = u.azimuth!.mul(Math.PI / 180),
    elevation = u.altitude!.mul(Math.PI / 180);
  const light = vec3(
    cos(angle).mul(cos(elevation)),
    sin(angle).mul(cos(elevation)),
    sin(elevation),
  );
  const base = sin(elevation),
    diffuse = dot(normal, light).sub(base);
  const edge = clamp(dot(g, g).mul(4), 0, 1);
  const shine = pow(max(0, dot(normal, normalize(light.add(vec3(0, 0, 1))))), u.gloss!).mul(edge);
  const lit = original.rgb
    .mul(u.ambient!.add(u.ambient!.oneMinus().mul(normal.z)))
    .add(c.highlightColor!.mul(max(0, diffuse).add(shine.mul(0.35))).mul(u.highlight!))
    .sub(original.rgb.sub(c.shadowColor!).mul(max(0, diffuse.negate())).mul(u.shadow!));
  return vec4(mix(original.rgb, clamp(lit, 0, 1), controls.amount), original.a);
}
