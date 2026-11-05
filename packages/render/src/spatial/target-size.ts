import type { RenderTarget } from "three/webgpu";
import { assertTextureSize } from "../cache/texture-limits";

const STEP = 64;

/** Storage may have spare pixels; the native viewport and downstream crop stay exact.
 * One extra bucket of hysteresis prevents resize churn around a boundary. Exports
 * use exact storage, and every preview capacity still passes normal GPU admission.
 */
export function spatialTargetSize(
  target: RenderTarget,
  width: number,
  height: number,
  preview: boolean,
  maxDimension: number,
) {
  assertTextureSize(width, height, maxDimension);
  const axis = (wanted: number, current: number) => {
    if (!preview) return wanted;
    if (
      current <= maxDimension &&
      current % STEP === 0 &&
      wanted <= current &&
      current - wanted < STEP * 2
    )
      return current;
    return Math.min(maxDimension, Math.ceil(wanted / STEP) * STEP);
  };
  return { width: axis(width, target.width), height: axis(height, target.height) };
}

/** Admission precedes allocation. Optional spare storage must not reject a valid tight frame. */
export function prepareSpatialTarget(
  target: RenderTarget,
  width: number,
  height: number,
  preview: boolean,
  maxDimension: number,
  admit: (width: number, height: number) => void,
) {
  let size = spatialTargetSize(target, width, height, preview, maxDimension);
  try {
    admit(size.width, size.height);
  } catch (error) {
    if (size.width === width && size.height === height) throw error;
    size = { width, height };
    admit(width, height);
  }
  target.setSize(size.width, size.height);
  target.viewport.set(0, 0, width, height);
}
