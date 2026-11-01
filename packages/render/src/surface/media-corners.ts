import { Texture, Vector2 } from "three/webgpu";
import { smoothstep, texture, uniform, uv, vec4 } from "three/tsl";
import { textureUv } from "../compositing/nodes/uv";
import { roundedRectangleDistance } from "./rounded-rectangle";
export function mediaCornerControls() {
  return {
    source: texture(new Texture()),
    flipY: uniform(0),
    size: uniform(new Vector2(1, 1)),
    radius: uniform(0),
  };
}
/** Clip source alpha before effects; color remains straight working RGB. */
export function mediaCornerNode(controls: ReturnType<typeof mediaCornerControls>) {
  const sample = controls.source.sample(textureUv(controls.flipY));
  const position = uv().sub(0.5).mul(controls.size);
  const distance = roundedRectangleDistance(position, controls.size.mul(0.5), controls.radius);
  return vec4(sample.rgb, sample.a.mul(smoothstep(0.5, -0.5, distance)));
}
