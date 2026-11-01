import { Fn, Loop, cos, float, length, max, min, mod, sin, sqrt, uv, vec2, vec4 } from "three/tsl";
import type { EffectNodeContext } from "../shared/context";
import { samplePremultiplied } from "../shared/premultiplied-sample";
import { normalizedBlur } from "./kernels";
import { blurCenter, protectBlur } from "./protection";

/** Arc sampling rotates the image around the authored center, capped by the spatial scale. */
export function spinNode(context: EffectNodeContext) {
  return protectBlur(
    context,
    Fn(() => {
      const { controls } = context;
      const center = blurCenter(context),
        delta = uv().mul(controls.logicalResolution).sub(center);
      const halfAngle = min(
        controls.parameters.spinAngle!.mul(Math.PI / 360),
        controls.scale.mul(Math.sqrt(3)).div(max(length(delta), 0.0001)),
      ).mul(controls.amount);
      const total = vec4(0).toVar();
      Loop({ start: 0, end: 33, type: "int" }, ({ i }) => {
        const angle = halfAngle.mul(float(i).div(16).sub(1));
        const rotated = vec2(
          delta.x.mul(cos(angle)).sub(delta.y.mul(sin(angle))),
          delta.x.mul(sin(angle)).add(delta.y.mul(cos(angle))),
        );
        total.addAssign(
          samplePremultiplied(context, center.add(rotated).div(controls.logicalResolution)),
        );
      });
      return normalizedBlur(total, float(33));
    })(),
  );
}

/** Radial line samples simulate a zoom streak, bounded independently of transport padding. */
export function zoomNode(context: EffectNodeContext) {
  return protectBlur(
    context,
    Fn(() => {
      const { controls } = context;
      const delta = uv().mul(controls.logicalResolution).sub(blurCenter(context));
      const distance = length(delta);
      const reach = min(
        distance.mul(controls.parameters.zoomStrength!),
        controls.scale.mul(Math.sqrt(3)),
      ).mul(controls.amount);
      const step = delta.div(max(distance, 0.0001)).mul(reach).div(controls.logicalResolution);
      const total = vec4(0).toVar();
      Loop({ start: 0, end: 33, type: "int" }, ({ i }) => {
        total.addAssign(samplePremultiplied(context, uv().add(step.mul(float(i).div(16).sub(1)))));
      });
      return normalizedBlur(total, float(33));
    })(),
  );
}

/** A deterministic 64-sample polygonal aperture convolution; no scene depth is assumed. */
export function lensNode(context: EffectNodeContext) {
  return protectBlur(
    context,
    Fn(() => {
      const { controls } = context,
        u = controls.parameters;
      const total = vec4(0).toVar(),
        weights = float(0).toVar();
      const sector = float(2 * Math.PI).div(u.apertureBlades!);
      const rotation = u.apertureRotation!.mul(Math.PI / 180);
      Loop({ start: 0, end: 64, type: "int" }, ({ i }) => {
        const index = float(i);
        const theta = index.mul(Math.PI * (3 - Math.sqrt(5)));
        // Polygon boundary is the intersection of the angle's ray with an aperture blade.
        const edge = cos(float(Math.PI).div(u.apertureBlades!)).div(
          cos(mod(theta.add(sector.mul(0.5)), sector).sub(sector.mul(0.5))),
        );
        const radius = sqrt(index.add(0.5).div(64))
          .mul(edge)
          .mul(controls.amount)
          .mul(controls.scale)
          .mul(2);
        const angle = theta.add(rotation);
        const offset = vec2(cos(angle), sin(angle)).mul(radius).div(controls.logicalResolution);
        // Scaling a uniform disk into a polygon changes the area Jacobian by edge².
        const weight = edge.mul(edge);
        total.addAssign(samplePremultiplied(context, uv().add(offset)).mul(weight));
        weights.addAssign(weight);
      });
      return normalizedBlur(total, weights);
    })(),
  );
}
