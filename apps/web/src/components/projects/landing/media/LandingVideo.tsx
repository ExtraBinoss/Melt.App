/** The server-visible image stays underneath until a decoded video frame is presented. */
export function LandingVideo({
  poster,
  video,
  width,
  height,
  eager = false,
  priority = false,
  loopDelayMs = 0,
}: {
  poster: string;
  video: string;
  width: number;
  height: number;
  eager?: boolean;
  priority?: boolean;
  loopDelayMs?: number;
}) {
  const loopDelay = Number.isFinite(loopDelayMs) && loopDelayMs > 0 ? loopDelayMs : 0;
  return (
    <>
      <img
        src={poster}
        alt=""
        loading={eager ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : undefined}
        draggable={false}
        width={width}
        height={height}
      />
      <video
        data-landing-video
        data-source={video}
        data-poster={poster}
        data-loop-delay-ms={loopDelay || undefined}
        muted
        playsInline
        loop={loopDelay === 0}
        preload="none"
        aria-hidden="true"
        tabIndex={-1}
        width={width}
        height={height}
      />
    </>
  );
}
