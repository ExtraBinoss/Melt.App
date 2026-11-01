interface PacketSize {
  byteLength: number;
  duration: number;
}

/** Encoded packet metadata only: no pixel reads, extra renders or retained media buffers. */
export function createEncodedSizeTracker(duration: number, hasAudio = false) {
  const tracks = {
    video: { bytes: 0, seconds: 0 },
    audio: { bytes: 0, seconds: 0 },
  };
  function add(track: keyof typeof tracks, packet: PacketSize) {
    if (
      !Number.isFinite(packet.byteLength) ||
      packet.byteLength < 0 ||
      !Number.isFinite(packet.duration) ||
      packet.duration <= 0
    )
      return;
    tracks[track].bytes += packet.byteLength;
    tracks[track].seconds += packet.duration;
  }
  return {
    video: (packet: PacketSize) => add("video", packet),
    audio: (packet: PacketSize) => add("audio", packet),
    estimate() {
      if (!Number.isFinite(duration) || duration <= 0) return null;
      // Observe a full GOP before extrapolating the initial, disproportionately large keyframe.
      const minimum = Math.min(2, duration);
      const included = hasAudio ? [tracks.video, tracks.audio] : [tracks.video];
      if (included.some((track) => track.seconds + 0.000001 < minimum)) return null;
      // Container metadata is unknown before finalization. Do not add a guessed percentage
      // to measured payloads; the finalized output size includes the actual mux overhead.
      return Math.ceil(
        included.reduce((bytes, track) => bytes + (track.bytes * duration) / track.seconds, 0),
      );
    },
  };
}
