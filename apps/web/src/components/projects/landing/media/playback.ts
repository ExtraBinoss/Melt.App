/** Native decoded clips share a bounded visible playback budget, without React frame updates. */
export function installLandingVideos(host: HTMLElement): () => void {
  if (typeof IntersectionObserver === "undefined") return () => {};
  const videos = [...host.querySelectorAll<HTMLVideoElement>("video[data-landing-video]")];
  const ratios = new Map<HTMLVideoElement, number>();
  const retained = new Map<HTMLVideoElement, number>();
  const epochs = new WeakMap<HTMLVideoElement, number>();
  const frames = new Map<HTMLVideoElement, number>();
  const loopTimers = new Map<HTMLVideoElement, ReturnType<typeof setTimeout>>();
  const ended = new Set<HTMLVideoElement>();
  let active = new Set<HTMLVideoElement>();
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  let disposed = false,
    clock = 0;
  function cancelFrame(video: HTMLVideoElement) {
    const frame = frames.get(video);
    if (frame !== undefined) video.cancelVideoFrameCallback(frame);
    frames.delete(video);
  }
  function cancelLoop(video: HTMLVideoElement) {
    const timer = loopTimers.get(video);
    if (timer !== undefined) clearTimeout(timer);
    loopTimers.delete(video);
  }
  function release(video: HTMLVideoElement) {
    cancelFrame(video);
    cancelLoop(video);
    ended.delete(video);
    epochs.set(video, (epochs.get(video) ?? 0) + 1);
    if (video.hasAttribute("src")) {
      video.pause();
      video.removeAttribute("src");
      video.load();
    }
    delete video.dataset.videoReady;
    retained.delete(video);
  }
  function ready(event: Event) {
    const video = event.currentTarget as HTMLVideoElement;
    cancelFrame(video);
    const reveal = () => {
      frames.delete(video);
      if (!disposed && !video.paused && video.readyState >= 2) video.dataset.videoReady = "true";
    };
    if (video.requestVideoFrameCallback) frames.set(video, video.requestVideoFrameCallback(reveal));
    else reveal();
  }
  function play(video: HTMLVideoElement) {
    const epoch = (epochs.get(video) ?? 0) + 1;
    epochs.set(video, epoch);
    void video.play().catch(() => {
      // Autoplay policy, decoder or network failure leaves the real poster visible.
      if (!disposed && epochs.get(video) === epoch) delete video.dataset.videoReady;
    });
  }
  function hold(video: HTMLVideoElement) {
    const delay = Number(video.dataset.loopDelayMs);
    if (
      !Number.isFinite(delay) ||
      delay <= 0 ||
      disposed ||
      document.hidden ||
      reduced.matches ||
      connection?.saveData ||
      loopTimers.has(video) ||
      !active.has(video) ||
      !video.hasAttribute("src")
    )
      return;
    const epoch = epochs.get(video);
    loopTimers.set(
      video,
      setTimeout(() => {
        loopTimers.delete(video);
        if (
          disposed ||
          epochs.get(video) !== epoch ||
          !active.has(video) ||
          !video.hasAttribute("src") ||
          document.hidden ||
          reduced.matches ||
          connection?.saveData
        )
          return;
        ended.delete(video);
        video.currentTime = 0;
        play(video);
      }, delay),
    );
  }
  function finish(event: Event) {
    const video = event.currentTarget as HTMLVideoElement;
    const delay = Number(video.dataset.loopDelayMs);
    if (!Number.isFinite(delay) || delay <= 0 || !video.hasAttribute("src") || ended.has(video))
      return;
    epochs.set(video, (epochs.get(video) ?? 0) + 1);
    ended.add(video);
    hold(video);
  }
  function update() {
    if (disposed) return;
    const visible =
      document.hidden || reduced.matches || connection?.saveData
        ? []
        : [...ratios]
            .filter(([, ratio]) => ratio >= 0.1)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 2)
            .map(([video]) => video);
    active = new Set(visible);
    for (const video of videos) {
      if (!active.has(video)) {
        cancelFrame(video);
        cancelLoop(video);
        if (!video.paused) {
          epochs.set(video, (epochs.get(video) ?? 0) + 1);
          video.pause();
        }
        continue;
      }
      retained.set(video, ++clock);
      if (!video.hasAttribute("src")) {
        video.poster = video.dataset.poster ?? "";
        video.src = video.dataset.source!;
      }
      // Keep the last decoded frame; readmission starts a fresh hold after interruption.
      if (ended.has(video)) hold(video);
      else if (video.paused) play(video);
    }
    for (const [video] of [...retained].sort((a, b) => a[1] - b[1])) {
      if (retained.size <= 3) break;
      if (!active.has(video)) release(video);
    }
  }
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries)
        ratios.set(
          entry.target as HTMLVideoElement,
          entry.isIntersecting ? entry.intersectionRatio : 0,
        );
      update();
    },
    { threshold: [0, 0.1, 0.25, 0.5, 0.75, 1] },
  );
  for (const video of videos) {
    video.muted = true;
    video.addEventListener("playing", ready);
    video.addEventListener("ended", finish);
    observer.observe(video);
  }
  reduced.addEventListener("change", update);
  document.addEventListener("visibilitychange", update);
  return () => {
    disposed = true;
    observer.disconnect();
    reduced.removeEventListener("change", update);
    document.removeEventListener("visibilitychange", update);
    for (const video of videos) {
      video.removeEventListener("playing", ready);
      video.removeEventListener("ended", finish);
      release(video);
    }
  };
}
