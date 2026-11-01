import { createPreviewPlayback } from "./playback";
import type { PreviewOwner, PreviewStatus } from "./runtime";

/** A locally encoded, immutable card preview needs no document, decoder worker or GPU scene. */
export function startVideoPreview(
  host: HTMLElement,
  source: string,
  status: (state: PreviewStatus, error?: unknown) => void,
): PreviewOwner {
  const retained = host.querySelector<HTMLVideoElement>("video[data-preview-video]");
  const video = retained ?? document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.loop = true;
  video.preload = "metadata";
  const playback = createPreviewPlayback();
  let closed = false;
  const update = () => {
    if (closed) return;
    const ready = video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA;
    const playing = ready && !video.paused;
    playback.position.set([video.currentTime]);
    playback.update({
      duration: Number.isFinite(video.duration) ? video.duration : 0,
      ready,
      playing,
    });
    host.dataset.previewTime = String(video.currentTime);
  };
  const playing = () => {
    update();
    if (!closed) status("playing");
  };
  const paused = () => {
    update();
    if (!closed) status("paused");
  };
  const failed = () => {
    if (!closed) status("failed", video.error ?? Error("Video preview failed."));
  };
  const play = () => {
    void video.play().catch((error: unknown) => {
      if (!closed) status("failed", error);
    });
  };
  video.addEventListener("loadedmetadata", update);
  video.addEventListener("timeupdate", update);
  video.addEventListener("playing", playing);
  video.addEventListener("pause", paused);
  video.addEventListener("error", failed);
  if (!retained) host.append(video);
  status("loading");
  video.src = source;
  play();
  return {
    playback,
    setPaused(value) {
      if (closed) return;
      if (value) video.pause();
      else play();
    },
    seek(seconds) {
      if (!closed && Number.isFinite(seconds)) {
        video.currentTime = Math.max(0, Math.min(seconds, video.duration || 0));
        update();
      }
    },
    async release() {
      if (closed) return;
      closed = true;
      video.pause();
      video.removeEventListener("loadedmetadata", update);
      video.removeEventListener("timeupdate", update);
      video.removeEventListener("playing", playing);
      video.removeEventListener("pause", paused);
      video.removeEventListener("error", failed);
      video.removeAttribute("src");
      video.load();
      if (!retained) video.remove();
      delete host.dataset.previewTime;
      playback.update({ playing: false, ready: false });
    },
  };
}
