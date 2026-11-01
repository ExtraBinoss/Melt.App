import { brand } from "../../../ui/brand/config";
import { useEffect, useRef, type CSSProperties } from "react";
import { ArrowUpRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { LANDING_TEMPLATES } from "./catalog";
import { MeltMark } from "../../../ui/brand/MeltMark";
import { NavigationButton } from "../../../ui/navigation/NavigationButton";
import { libraryPreviewHref } from "../items/links";
import { LandingVideo } from "./media/LandingVideo";
import "../templates/messages";
import "./messages";
import { installCarouselPan } from "./carousel/controller";

export function ShowcaseCarousel({
  onChoose,
  busy = false,
}: {
  onChoose: (id: string) => void;
  busy?: boolean;
}) {
  const { t } = useTranslation();
  const viewport = useRef<HTMLDivElement>(null);
  const position = useRef(0);
  useEffect(() => {
    const node = viewport.current;
    if (!node) return;
    const pan = installCarouselPan(node, {
      // The retained controller owns the live media query and cancels motion immediately.
      reducedMotion: false,
      position: position.current,
    });
    return () => {
      position.current = pan.position();
      pan.dispose();
    };
  }, []);
  return (
    <section className="landing-showcase" aria-label={t("landing:showcase")}>
      <div
        ref={viewport}
        className="landing-showcase-scroll"
        tabIndex={0}
        role="group"
        aria-label={t("landing:showcase")}
        aria-description={t("landing:showcaseHint")}
        data-carousel
      >
        {LANDING_TEMPLATES.map((template, index) => (
          <NavigationButton
            key={template.id}
            variant="ghost"
            draggable={false}
            style={{ "--template-aspect": template.width / template.height } as CSSProperties}
            className="landing-template-card"
            disabled={busy}
            aria-label={t("templates:use", { name: t(template.nameKey) })}
            href={libraryPreviewHref({ kind: "template", id: template.id })}
            onNavigate={() => onChoose(template.id)}
          >
            <span className="landing-template-stage" data-tone={index % 3}>
              <LandingVideo
                poster={template.preview}
                video={template.video}
                width={template.width}
                height={template.height}
                eager={index < 2}
                priority={index === 0}
              />
              <span className="landing-template-open" aria-hidden>
                <ArrowUpRight size={20} />
              </span>
            </span>
            <span className="landing-template-caption">
              <span>{t(template.nameKey)}</span>
              <span>
                <MeltMark size={14} />
                {brand.name}
              </span>
            </span>
          </NavigationButton>
        ))}
      </div>
    </section>
  );
}
