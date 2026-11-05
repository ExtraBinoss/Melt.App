import type { Node } from "three/webgpu";
import { cos, length, max, sin, smoothstep, uv, vec2 } from "three/tsl";
import type { EffectUniforms } from "../shared/uniforms";
import { mixEffectCoverage } from "../shared/compositing/node";

/** Final shared influence field, applied after the native treatment and compositing.
 * Coordinates describe the authored content, excluding expanded blur/shadow margins. */
export function applyEffectDomain(
  input: Node<"vec4">,
  output: Node<"vec4">,
  controls: EffectUniforms,
) {
  const p = controls.parameters;
  if (!p.domainEnabled) return output;
  const pixel = uv().mul(controls.logicalResolution).sub(controls.contentOrigin);
  const delta = vec2(
    pixel.x.sub(p.domainX!.mul(controls.contentResolution.x)),
    controls.contentResolution.y.sub(pixel.y).sub(p.domainY!.mul(controls.contentResolution.y)),
  );
  const angle = p.domainAngle!.mul(Math.PI / 180);
  const rotated = vec2(
    delta.x.mul(cos(angle)).add(delta.y.mul(sin(angle))),
    delta.y.mul(cos(angle)).sub(delta.x.mul(sin(angle))),
  );
  const radius = max(
    0.001,
    p.domainRadius!.mul(controls.contentResolution.x.min(controls.contentResolution.y)),
  );
  const distance = length(vec2(rotated.x.div(p.domainAspect!), rotated.y)).div(radius);
  const aa = max(controls.pixelFootprint.x, controls.pixelFootprint.y).div(radius).max(0.00001);
  const coverage = smoothstep(p.domainFeather!.oneMinus().sub(aa), aa.add(1), distance).oneMinus();
  return mixEffectCoverage(input, output, p.domainEnabled.greaterThan(0).select(coverage, 1));
}
