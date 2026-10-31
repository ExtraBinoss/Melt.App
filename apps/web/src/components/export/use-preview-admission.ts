import { useEffect, useState, type RefObject } from "react";

/** Paint the dialog first, then admit GPU preparation when its real entrance finishes. */
export function usePreviewAdmission(surface?: RefObject<HTMLElement | null>) {
  const [ready, setReady] = useState(!surface);
  useEffect(() => {
    if (!surface) return;
    let active = true;
    const frame = requestAnimationFrame(() => {
      const element = surface.current;
      const animations =
        element?.getAnimations?.().filter((animation) => animation.playState !== "finished") ?? [];
      void Promise.allSettled(animations.map((animation) => animation.finished)).then(() => {
        if (active && element?.isConnected && element.dataset.state !== "closed") setReady(true);
      });
    });
    return () => {
      active = false;
      cancelAnimationFrame(frame);
    };
  }, [surface]);
  return ready;
}
