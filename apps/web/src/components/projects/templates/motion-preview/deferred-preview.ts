import type { PreviewOwner, PreviewStatus } from "./runtime";
import { createPreviewPlayback } from "./playback";

/** Keep the native renderer/animation code outside the library's initial module graph. */
export function startDeferredPreview(
  load: (signal: AbortSignal) => Promise<PreviewOwner>,
  status: (value: PreviewStatus, error?: unknown) => void,
): PreviewOwner {
  const playback = createPreviewPlayback();
  const controller = new AbortController();
  let closed = false,
    owner: PreviewOwner | undefined;
  let closing: Promise<void> | undefined;
  let stopState: (() => void) | undefined, stopPosition: (() => void) | undefined;
  status("loading");
  const pending = load(controller.signal)
    .then(async (value) => {
      owner = value;
      if (closed) {
        await value.release();
        return;
      }
      if (value.playback) {
        const source = value.playback;
        const state = () => playback.update(source.read());
        const position = () => playback.position.set(source.position.read());
        stopState = source.subscribe(state);
        stopPosition = source.position.subscribe(position);
        state();
        position();
      }
    })
    .catch((error: unknown) => {
      if (closed && owner) throw error;
      if (!closed) status("failed", error);
    });
  return {
    playback,
    setPaused: (value) => {
      if (!closed) owner?.setPaused?.(value);
    },
    seek: (seconds) => {
      if (!closed) owner?.seek?.(seconds);
    },
    release() {
      return (closing ??= (async () => {
        closed = true;
        controller.abort();
        stopState?.();
        stopPosition?.();
        try {
          if (owner) await owner.release();
          else await pending;
        } finally {
          playback.update({ playing: false, ready: false });
        }
      })());
    },
  };
}
