import { brand } from "../../../ui/brand/config";
import { useEffect, useRef } from "react";
import { ArrowUpRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { LANDING_TEMPLATES } from "./catalog";
import { MeltMark } from "../../../ui/brand/MeltMark";
import { SocialBrandIcon } from "../../assets/SocialBrandIcon";
import { Button } from "../../ui/button";
import { templatePreview } from "../templates/preview";
import "../templates/messages";
import "./messages";
import "./motion-showcase.css";
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
          <Button
            key={template.id}
            variant="ghost"
            className="landing-template-card"
            disabled={busy}
            aria-label={t("templates:use", { name: t(template.nameKey) })}
            onClick={() => onChoose(template.id)}
          >
            <span className="landing-template-stage" data-tone={index % 3}>
              {template.preview ? (
                <img
                  src={template.preview}
                  alt=""
                  loading={index < 2 ? "eager" : "lazy"}
                  fetchPriority={index === 0 ? "high" : undefined}
                  draggable={false}
                  width={template.width}
                  height={template.height}
                />
              ) : (
                <span
                  className="landing-template-paper"
                  style={{
                    aspectRatio: `${template.width}/${template.height}`,
                    background: templatePreview(template.id),
                  }}
                >
                  <SocialBrandIcon id={template.brandId ?? ""} size={34} />
                  <span>
                    {template.width} × {template.height}
                  </span>
                </span>
              )}
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
          </Button>
        ))}
      </div>
    </section>
  );
}
