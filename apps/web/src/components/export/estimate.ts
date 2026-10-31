/** Target-rate estimate, including the configured audio rate and a small mux allowance. VBR varies. */
export function estimateVideoBytes(duration: number, bitrate: number, audio = false) {
  if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(bitrate) || bitrate <= 0)
    return null;
  return Math.ceil(((duration * (bitrate + (audio ? 192_000 : 0))) / 8) * 1.02);
}
