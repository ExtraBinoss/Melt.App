import { Fn, If, abs, clamp, dot, length, mix, smoothstep, uv, vec2, vec3, vec4 } from "three/tsl";
import type { Node } from "three/webgpu";
import { sampleEffect, type EffectNodeContext } from "../shared/context";
import { mixEffectCoverage } from "../shared/compositing/node";
/** Normalized derivative kernels; Scharr is the default, not an undocumented Canny approximation. */
export function edgeDetectNode({ source, backdrop, controls }: EffectNodeContext) {
  return Fn(() => {
    const u = controls.parameters,
      p = uv();
    const original = sampleEffect(
      backdrop!,
      { ...controls, sourceFlipY: controls.backdropFlipY },
      p,
    ).toVar();
    const delta = vec2(u.width!).div(controls.logicalResolution);
    const sample = (x: number, y: number) => {
      const s = sampleEffect(source, controls, clamp(p.add(delta.mul(vec2(x, y))), 0, 1));
      return mix(dot(s.rgb, vec3(0.2126, 0.7152, 0.0722)).mul(s.a), s.a, u.source!);
    };
    const a = sample(-1, -1).toVar(),
      b = sample(0, -1).toVar(),
      c = sample(1, -1).toVar();
    const d = sample(-1, 0).toVar(),
      e = sample(0, 0).toVar(),
      f = sample(1, 0).toVar();
    const g = sample(-1, 1).toVar(),
      h = sample(0, 1).toVar(),
      i = sample(1, 1).toVar();
    const response = length(
      vec2(
        c.add(i).sub(a).sub(g).mul(3).add(f.sub(d).mul(10)),
        g.add(i).sub(a).sub(c).mul(3).add(h.sub(b).mul(10)),
      ),
    )
      .div(16)
      .toVar();
    const gradient = (weight: number, divisor: number) =>
      length(
        vec2(
          c.add(i).sub(a).sub(g).add(f.sub(d).mul(weight)),
          g.add(i).sub(a).sub(c).add(h.sub(b).mul(weight)),
        ),
      ).div(divisor);
    If(u.method!.equal(1), () => response.assign(gradient(2, 4)));
    If(u.method!.equal(2), () => response.assign(gradient(1, 3)));
    If(u.method!.equal(3), () => response.assign(length(vec2(e.sub(i), f.sub(h)))));
    If(u.method!.equal(4), () => response.assign(abs(b.add(d).add(f).add(h).sub(e.mul(4))).div(4)));
    If(u.method!.equal(5), () => {
      const near = a.add(c).add(g).add(i).add(b.add(d).add(f).add(h).mul(2)).add(e.mul(4)).div(16);
      let far: Node<"float"> = e.mul(4);
      for (const [x, y] of [
        [-2, -2],
        [2, -2],
        [-2, 2],
        [2, 2],
      ])
        far = far.add(sample(x!, y!));
      for (const [x, y] of [
        [0, -2],
        [-2, 0],
        [2, 0],
        [0, 2],
      ])
        far = far.add(sample(x!, y!).mul(2));
      response.assign(abs(near.sub(far.div(16))).mul(4));
    });
    const edge = smoothstep(u.threshold!, u.threshold!.add(u.softness!), response.mul(u.gain!));
    const weight = mix(edge, edge.oneMinus(), u.invert!);
    const rgb = mix(controls.colors.backgroundColor!, controls.colors.foregroundColor!, weight);
    const mapped = vec4(rgb, original.a.mul(mix(weight, 1, u.backgroundOpacity!)));
    const overlay = vec4(mix(original.rgb, controls.colors.foregroundColor!, weight), original.a);
    return mixEffectCoverage(
      original,
      u.overlay!.greaterThan(0.5).select(overlay, mapped),
      controls.amount,
    );
  })();
}
