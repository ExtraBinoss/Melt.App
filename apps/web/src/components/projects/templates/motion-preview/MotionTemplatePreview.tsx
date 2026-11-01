import { useCallback } from "react";
import type { MotionTemplateId } from "../../../../services/projects/templates/motion/model";
import { MotionPreviewSurface } from "./MotionPreviewSurface";
import type { PreviewStatus } from "./runtime";
import { startDeferredPreview } from "./deferred-preview";
import { startVideoPreview } from "./video-preview";
import {
  MOTION_TEMPLATE_ASSET_REVISIONS,
  MOTION_TEMPLATE_CARD_CLIPS,
} from "../../../../services/projects/templates/motion/asset-revisions";

export function MotionTemplatePreview({
  templateId,
  poster,
  autoplay = false,
  disabled = false,
  className,
}: {
  templateId: MotionTemplateId;
  poster: string;
  autoplay?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  const clip = MOTION_TEMPLATE_CARD_CLIPS[templateId];
  const source =
    !autoplay && clip && clip.sourceRevision === MOTION_TEMPLATE_ASSET_REVISIONS[templateId]
      ? `${import.meta.env.BASE_URL}templates/motion/${templateId}/${templateId}.card.mp4?v=${clip.revision}`
      : undefined;
  const start = useCallback(
    (host: HTMLElement, onStatus: (status: PreviewStatus, error?: unknown) => void) =>
      source
        ? startVideoPreview(host, source, onStatus)
        : startDeferredPreview(async (signal) => {
            const module = await import("./runtime");
            signal.throwIfAborted();
            return module.startMotionTemplatePreview({ templateId, host, onStatus });
          }, onStatus),
    [templateId, source],
  );
  return (
    <MotionPreviewSurface
      key={`${templateId}:${poster}:${source ?? "native"}`}
      autoplay={autoplay}
      startPreview={start}
      poster={poster}
      nativeVideo={Boolean(source)}
      disabled={disabled}
      className={className}
    />
  );
}
