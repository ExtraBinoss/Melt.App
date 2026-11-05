import type { Node } from "three/webgpu";
import { screenCoordinate, uv, vec2 } from "three/tsl";
import type { EffectUniforms } from "./uniforms";

/** Authored Y-up pixels, independent of transport margins and canvas viewport windows. */
export function authoredPixel(controls: EffectUniforms, position: Node<"vec2"> = uv()) {
  return position.mul(controls.logicalResolution).sub(controls.contentOrigin);
}

/** Normalized authored image UVs; these may lie outside the content in an expanded window. */
export function authoredUv(controls: EffectUniforms, position: Node<"vec2"> = uv()) {
  return authoredPixel(controls, position).div(controls.contentResolution);
}

/** Portable image fields use Y-down document coordinates. */
export function authoredPixelDown(controls: EffectUniforms, position: Node<"vec2"> = uv()) {
  const origin = vec2(
    controls.contentOrigin.x,
    controls.logicalResolution.y.sub(controls.contentOrigin.y).sub(controls.contentResolution.y),
  );
  return vec2(position.x, position.y.oneMinus()).mul(controls.logicalResolution).sub(origin);
}

/** Map an authored image UV back to the actual input texture, before its backend Y flip. */
export function transportUv(controls: EffectUniforms, position: Node<"vec2">) {
  return position
    .mul(controls.contentResolution)
    .add(controls.contentOrigin)
    .div(controls.logicalResolution);
}

/** Exact target fragment centers avoid interpolated-UV cancellation at floor/fract/sign ties.
 * Three normalizes screenCoordinate to Y-down for both WebGPU and WebGL targets. */
export function authoredFragmentPixel(controls: EffectUniforms) {
  return vec2(screenCoordinate.x, controls.resolution.y.sub(screenCoordinate.y))
    .mul(controls.pixelFootprint)
    .sub(controls.contentOrigin);
}

export function authoredFragmentPixelDown(controls: EffectUniforms) {
  const origin = vec2(
    controls.contentOrigin.x,
    controls.logicalResolution.y.sub(controls.contentOrigin.y).sub(controls.contentResolution.y),
  );
  return screenCoordinate.mul(controls.pixelFootprint).sub(origin);
}
