import {
  Fn,
  clamp,
  cos,
  dot,
  max,
  mix,
  normalize,
  pow,
  sin,
  uv,
  vec2,
  vec3,
  vec4,
} from "three/tsl";
import { sampleEffect, type EffectNodeContext } from "../shared/context";
import { samplePremultiplied } from "../shared/premultiplied-sample";

/** Smoothed source relief, wrapped subsurface light and a broad wax specular lobe.
 * A fixed Gaussian stencil costs 25 premultiplied bilinear samples, at any radius.
 * This is a screen-space coating, not geometry or a physical scattering simulation. */
export function waxNode(context: EffectNodeContext) {
  const { source, controls } = context,
    p = uv(),
    original = sampleEffect(source, controls, p);
  const coated = Fn(() => {
    const u = controls.parameters,
      total = vec4(0).toVar(),
      slope = vec2(0).toVar(),
      chromaX = vec3(0).toVar(),
      chromaY = vec3(0).toVar();

    // Offsets are authored pixels in the transport, never viewport/DPR pixels.
    // Premultiplied interpolation prevents hidden RGB from staining the coating.
    for (let y = -2; y <= 2; y++)
      for (let x = -2; x <= 2; x++) {
        const weight = Math.exp(-(x * x + y * y) / 2),
          offset = vec2(x, -y).mul(u.blur!.mul(0.5)).div(controls.logicalResolution),
          sample = samplePremultiplied(context, p.add(offset)).toVar(),
          height = dot(sample.rgb, vec3(0.2126, 0.7152, 0.0722))
            .mul(0.7)
            .add(sample.a.mul(0.3));
        total.addAssign(sample.mul(weight));
        slope.addAssign(vec2(x, y).mul(height).mul(weight));
        chromaX.addAssign(sample.rgb.mul(x * weight));
        chromaY.addAssign(sample.rgb.mul(y * weight));
      }

    const coverage = max(total.a, 0.000001),
      wash = total.rgb.div(coverage),
      // The derivative includes source alpha, giving flat cutouts a rounded lip.
      normal = normalize(vec3(slope.mul(u.relief!).mul(-2.4), 1)).toVar(),
      angle = u.lightAngle!.mul(Math.PI / 180),
      elevation = u.lightElevation!.mul(Math.PI / 180),
      light = vec3(
        cos(angle).mul(cos(elevation)),
        sin(angle).mul(cos(elevation)),
        sin(elevation),
      ).toVar(),
      facing = dot(normal, light),
      half = normalize(light.add(vec3(0, 0, 1))),
      shine = pow(max(dot(normal, half), 0), mix(8, 80, u.gloss!)),
      broad = pow(max(dot(normal, half), 0), 3),
      // Wrap light into the unlit side instead of adding a source-independent halo.
      wrap = clamp(facing.add(0.65).div(1.65), 0, 1),
      transmitted = pow(max(dot(normal.negate(), light).add(0.55), 0), 2)
        .mul(u.translucence!)
        .mul(0.2),
      colorSlope = chromaX
        .mul(cos(angle))
        .add(chromaY.mul(sin(angle)))
        .div(coverage),
      // First-order channel spread of the softened source along the light direction.
      chromatic = vec3(colorSlope.r, 0, colorSlope.b.negate()).mul(u.aberration!).mul(0.65),
      softened = mix(original.rgb, wash, 0.82).add(chromatic),
      wax = controls.colors.waxColor!,
      body = mix(softened, wax, u.tint!.mul(0.6))
        .mul(mix(0.65, 1.08, wrap))
        .mul(u.brightness!),
      scatter = wash.mul(wax).mul(u.translucence!).mul(0.12).add(wax.mul(transmitted)),
      lit = body.add(scatter).add(wax.mul(shine).mul(0.38)),
      // Screen only a low, wide surface lobe; preserve source coverage exactly.
      bloom = clamp(wax.mul(broad).mul(u.glow!).mul(0.2), 0, 1);
    return clamp(lit.oneMinus().mul(bloom.oneMinus()).oneMinus(), 0, 1);
  })();
  return vec4(mix(original.rgb, coated, controls.amount), original.a);
}
