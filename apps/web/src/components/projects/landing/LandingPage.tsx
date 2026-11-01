import { NavigationButton } from "../../../ui/navigation/NavigationButton";
import { dashboardHref } from "../../../ui/navigation/activation";
import { BrandStatus } from "../../../ui/brand/BrandStatus";
import { SiteHeader } from "../../site/SiteHeader";
import { SiteFooter } from "../../site/SiteFooter";
import { Faq, type FaqItem } from "../../site/Faq";
import "../../site/messages";
import { ArrowUpRight, Play } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "../../ui/button";
import { HeroHeadline } from "./HeroHeadline";
import { ShowcaseCarousel } from "./ShowcaseCarousel";
import "./messages";
import "./landing.css";

const features = ["canvas", "effects", "motion", "agent"] as const;
/** Video slots remain placeholders until clips are supplied in public/videos. */
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
  return (
    <div className="landing-page" id="top">
      <SiteHeader landing onTry={onCreate} onPrepare={onPrepare} disabled={busy} />
      <section className="landing-intro" id="musart-intro">
        <HeroHeadline lines={[t("titleFirst"), t("titleSecond")]} />
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
        <p>{t("description")}</p>
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
            <div className="landing-video-placeholder" data-video-slot={feature}>
              <span className="landing-video-frame">
                <Play size={22} fill="currentColor" />
                <span>{t("preview")}</span>
              </span>
            </div>
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
