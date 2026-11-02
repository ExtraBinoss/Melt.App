import { useEffect, useRef } from "react";
import { installLandingVideos } from "./media/playback";
import { FeatureVisual } from "./features/FeatureVisual";
import { NavigationButton } from "../../../ui/navigation/NavigationButton";
import { dashboardHref } from "../../../ui/navigation/activation";
import { BrandStatus } from "../../../ui/brand/BrandStatus";
import { SiteHeader } from "../../site/SiteHeader";
import { SiteFooter } from "../../site/SiteFooter";
import { Faq, type FaqItem } from "../../site/Faq";
import "../../site/messages";
import { ArrowUpRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "../../ui/button";
import { HeroHeadline } from "./HeroHeadline";
import { HeroMascot } from "./hero/HeroMascot";
import { ShowcaseCarousel } from "./ShowcaseCarousel";
import "./messages";
import "./landing.css";
import "./hero/hero.css";

const features = ["canvas", "effects", "motion", "agent", "timelapse", "export"] as const;
/** Supplied feature clips share the same native playback budget as the showcase. */
export function LandingPage({
  onCreate,
  onTemplate,
  busy = false,
  onCancel,
  onPrepare,
}: {
  onCreate: () => void;
  onTemplate?: (id: string) => void;
  busy?: boolean;
  onCancel?: () => void;
  onPrepare?: () => void;
}) {
  const { t } = useTranslation("landing");
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => (host.current ? installLandingVideos(host.current) : undefined), []);
  return (
    <div ref={host} className="landing-page" id="top">
      <SiteHeader landing onTry={onCreate} onPrepare={onPrepare} disabled={busy} />
      <section className="landing-intro" id="musart-intro">
        <div className="landing-title-block">
          <HeroMascot />
          <HeroHeadline lines={[t("titleFirst"), t("titleSecond")]} />
        </div>
        <NavigationButton
          className="landing-cta"
          href={dashboardHref}
          disabled={busy}
          onNavigate={onCreate}
          onPrepare={onPrepare}
        >
          {t("create")}
          <ArrowUpRight size={18} />
        </NavigationButton>
      </section>
      <ShowcaseCarousel onChoose={onTemplate ?? onCreate} busy={busy} />
      <section className="landing-creativity">
        <h2>{t("creativity")}</h2>
        <NavigationButton
          className="landing-cta"
          href={dashboardHref}
          disabled={busy}
          onNavigate={onCreate}
          onPrepare={onPrepare}
        >
          {t("create")}
          <ArrowUpRight size={18} />
        </NavigationButton>
      </section>
      <section id="features" className="landing-features" aria-label={t("features")}>
        {features.map((feature) => (
          <article className="landing-feature-tile" key={feature} data-feature={feature}>
            <div className="landing-feature-copy">
              <h3>{t(feature)}</h3>
              <p>{t(`${feature}Hint`)}</p>
            </div>
            <FeatureVisual kind={feature} />
          </article>
        ))}
      </section>
      <Faq title={t("site:faq")} items={t("site:faqItems", { returnObjects: true }) as FaqItem[]} />
      <section className="landing-footer">
        <h2>{t("end")}</h2>
        <NavigationButton
          className="landing-cta"
          href={dashboardHref}
          disabled={busy}
          onNavigate={onCreate}
          onPrepare={onPrepare}
        >
          {t("create")}
          <ArrowUpRight size={18} />
        </NavigationButton>
      </section>
      <SiteFooter />
      {busy && (
        <div className="landing-loading" role="status">
          <BrandStatus size={22} state="preparing" />
          <span>{t("opening")}</span>
          {onCancel && (
            <Button size="sm" variant="ghost" onClick={onCancel}>
              {t("cancel")}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
