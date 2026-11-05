/** Precision changes affect only future movement, so pressing Shift never jumps a draft. */
export function gestureGain(shift: boolean, pixels: number, elapsed: number): number {
  if (shift) return 0.1;
  return elapsed > 0 && elapsed < 250 && Math.abs(pixels) / elapsed < 0.12 ? 0.25 : 1;
}

export function snapNumericValue(
  value: number,
  min: number,
  max: number,
  step: number,
  tolerance: number,
) {
  const interval = step >= 1 ? step : max - min > 2 ? 0.5 : max - min > 0.3 ? 0.1 : step * 5;
  const near = [min, max, 0, Math.round(value / interval) * interval]
    .filter(
      (point) =>
        point >= min &&
        point <= max &&
        Math.abs(Math.round(point / step) * step - point) < step * 0.01,
    )
    .sort((a, b) => Math.abs(value - a) - Math.abs(value - b))[0];
  if (near !== undefined && Math.abs(value - near) <= Math.min(tolerance, interval * 0.12))
    return { value: Number(near.toFixed(6)), target: near };
  const bounded = Math.max(min, Math.min(max, Math.round(value / step) * step));
  return { value: Number(bounded.toFixed(6)), target: null };
}

/** Five or ten useful units, scaled to the control's authored range. */
export function gestureQuantum(min: number, max: number, step: number, speed: number) {
  const unit = 10 ** Math.floor(Math.log10(Math.max(step, (max - min) / 100)));
  return Math.max(step, unit * (speed > 0.5 ? 10 : 5));
}
