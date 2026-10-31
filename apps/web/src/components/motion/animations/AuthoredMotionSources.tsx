import { Diamond, Layers } from "lucide-react";
import { useTranslation } from "react-i18next";
import { getAncestors, type Composition, type EnginePort } from "@musart/core";
import { Button } from "../../ui/button";
import { motionPropertyLabel } from "../rows/property-label";
import { animationPresentation } from "./presentation";

export function motionSources(page: Composition, layerId: string) {
  const tracks = page.motion?.tracks ?? [];
  return {
    custom: tracks.filter(
      (track) =>
        track.layerId === layerId && track.properties.some((property) => property.keyframes.length),
    ),
    inherited: getAncestors(page, layerId).filter((layer) =>
      tracks.some(
        (track) =>
          track.layerId === layer.id &&
          (track.properties.some((property) => property.keyframes.length) ||
            track.animations?.some((animation) => animation.enabled)),
      ),
    ),
  };
}

/** Explain authored and inherited movement without fabricating presets or duplicating keys. */
export function AuthoredMotionSources({
  engine,
  page,
  layerId,
  sources,
}: {
  engine: EnginePort;
  page: Composition;
  layerId: string;
  sources: ReturnType<typeof motionSources>;
}) {
  const { t } = useTranslation("animations"),
    { t: motion } = useTranslation("motion"),
    { t: common } = useTranslation();
  const layer = page.layers.find((item) => item.id === layerId)!;
  const current = () =>
    engine.getSnapshot().project.pages.find((item) => item.id === page.id) === page;
  return (
    <>
      {sources.custom.map((track) => (
        <div className="animation-instance animation-authored-source" key={track.id}>
          <div className="animation-instance-header">
            <Diamond size={12} aria-hidden />
            <strong className="animation-instance-name">{t("custom")}</strong>
            <Button
              variant="ghost"
              size="xs"
              onClick={() => {
                if (!current()) return;
                engine.select([layerId]);
                animationPresentation(engine).set({ details: true, selected: null });
              }}
            >
              {t("editKeyframes")}
            </Button>
          </div>
          <p className="muted-description">
            {track.properties
              .filter((property) => property.keyframes.length)
              .map((property) => motionPropertyLabel(property.target, layer, motion, common))
              .join(" · ")}
          </p>
        </div>
      ))}
      {sources.inherited.map((owner) => (
        <Button
          key={owner.id}
          variant="ghost"
          size="xs"
          className="animation-inherited-source"
          onClick={() => {
            if (current()) engine.select([owner.id]);
          }}
        >
          <Layers size={12} aria-hidden />
          {t("animatedBy", { name: owner.name })}
        </Button>
      ))}
    </>
  );
}
