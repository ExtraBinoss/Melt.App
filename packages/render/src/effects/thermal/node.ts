import { authoredPixel } from "../shared/coordinates";
import type { Node } from "three/webgpu";
import {
  float,
  clamp,
  dot,
  floor,
  fract,
  max,
  mix,
  pow,
  sin,
  smoothstep,
  uv,
  vec2,
  vec3,
  vec4,
} from "three/tsl";
import { sampleEffect, type EffectNodeContext } from "../shared/context";
/** An artistic intensity heatmap; no temperature is inferred from ordinary pixels. */
export function thermalNode({ source, controls }: EffectNodeContext) {
  const u = controls.parameters,
    p = uv(),
    s = sampleEffect(source, controls, p);
  const lum = (q: Node<"vec2">) =>
    dot(sampleEffect(source, controls, q).rgb, vec3(0.299, 0.587, 0.114));
  const l = dot(s.rgb, vec3(0.299, 0.587, 0.114));
  const x = smoothstep(u.low!, max(u.low!.add(0.001), u.high!), l.mul(u.gain!));
  const corrected = pow(clamp(x, 0, 1), u.gamma!.reciprocal());
  const v = mix(corrected, corrected.oneMinus(), u.reverse!);
  const t = mix(v, floor(v.mul(u.bands!)).div(u.bands!), u.posterize!);
  const ramp = (a: Node<"vec3">, b: Node<"vec3">, c: Node<"vec3">, d: Node<"vec3">) =>
    mix(
      mix(a, b, smoothstep(0, 0.34, t)),
      mix(c, d, smoothstep(0.66, 1, t)),
      smoothstep(0.34, 0.66, t),
    );
  const iron = ramp(
    vec3(0.02, 0, 0.08),
    vec3(0.42, 0.01, 0.46),
    vec3(1, 0.24, 0.02),
    vec3(1, 1, 0.82),
  );
  const rainbow = clamp(
    vec3(
      t.mul(4).sub(3).abs().sub(1),
      vec3(0).x.add(2).sub(t.mul(4).sub(2).abs()),
      vec3(0).x.add(2).sub(t.mul(4).sub(1).abs()),
    ),
    0,
    1,
  );
  const ice = ramp(
    vec3(0.01, 0.01, 0.06),
    vec3(0.03, 0.12, 0.62),
    vec3(0.05, 0.8, 0.95),
    vec3(0.95, 1, 1),
  );
  let color: Node<"vec3"> = mix(iron, rainbow, float(u.palette!.equal(1)));
  color = mix(color, ice, float(u.palette!.equal(2)));
  color = mix(color, vec3(t), float(u.palette!.equal(3)));
  color = mix(vec3(dot(color, vec3(0.299, 0.587, 0.114))), color, u.saturation!);
  const dx = vec2(1, 0).div(controls.logicalResolution),
    dy = vec2(0, 1).div(controls.logicalResolution);
  const edges = lum(p.add(dx))
    .sub(lum(p.sub(dx)))
    .abs()
    .add(
      lum(p.add(dy))
        .sub(lum(p.sub(dy)))
        .abs(),
    );
  const grain = fract(
    sin(
      dot(floor(authoredPixel(controls, p)), vec2(12.9898, 78.233)).add(
        controls.time.mul(u.speed!),
      ),
    ).mul(43758.5453),
  ).sub(0.5);
  const scan = sin(authoredPixel(controls, p).y.mul(Math.PI).add(controls.time.mul(u.speed!)))
    .mul(0.5)
    .add(0.5);
  color = clamp(
    color
      .add(edges.mul(u.edges!))
      .add(grain.mul(u.grain!))
      .mul(scan.mul(u.scanlines!).mul(-0.25).add(1)),
    0,
    1,
  );
  return vec4(mix(s.rgb, color, controls.amount), s.a);
}
