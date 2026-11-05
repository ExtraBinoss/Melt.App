import { useEffect, useState } from "react";
import { loadPackPosters } from "../../../services/assets/studio/posters";

/** Decode once before exposing every tile; scrolling starts no model or GPU preparation. */
export function usePackAtlas(enabled: boolean) {
  const [image, setImage] = useState("");
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    let url = "";
    void loadPackPosters(controller.signal)
      .then(async (blob) => {
        controller.signal.throwIfAborted();
        url = URL.createObjectURL(blob);
        const decoded = new Image();
        decoded.src = url;
        await decoded.decode();
        if (!controller.signal.aborted) setImage(url);
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => {
      controller.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [enabled]);
  return { image, failed };
}
