import { NavigationButton } from "../../ui/navigation/NavigationButton";
import { TransitionLink } from "../../ui/navigation/TransitionLink";
import { ArrowUpRight } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { brand } from "../../ui/brand/config";
import { MeltMark } from "../../ui/brand/MeltMark";
import { Button } from "../ui/button";
import { publicHref } from "../../tools/catalog";
import "./messages";
import "./site.css";
export function SiteHeader({
  onTry,
  onPrepare,
  landing = false,
  disabled = false,
}: {
  onTry?: () => void;
  onPrepare?: () => void;
  landing?: boolean;
  disabled?: boolean;
}) {
  const { t } = useTranslation("site");
  const [section, setSection] = useState(landing ? "" : "tools");
  useEffect(() => {
    if (!landing || typeof IntersectionObserver === "undefined") return;
    const sections = ["features", "faq"]
      .map((id) => document.getElementById(id))
      .filter((node): node is HTMLElement => node !== null);
    const visible = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.add(entry.target.id);
          else visible.delete(entry.target.id);
        }
        setSection(visible.has("faq") ? "faq" : visible.has("features") ? "features" : "");
      },
      { rootMargin: "-100px 0px -35% 0px" },
    );
    sections.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [landing]);
  return (
    <header className={`site-header ${landing ? "landing-nav" : ""}`}>
      <TransitionLink
        href={landing ? "#musart-intro" : publicHref("/")}
        revealTarget=".landing-page"
        className="landing-brand"
      >
        <MeltMark size={30} interactive />
        {brand.name}
      </TransitionLink>
      <nav aria-label={t("resources")}>
        <TransitionLink
          href={publicHref("/#features")}
          revealTarget=".landing-page"
          aria-current={section === "features" ? "location" : undefined}
        >
          {t("features")}
        </TransitionLink>
        <TransitionLink
          href={publicHref("/#faq")}
          revealTarget=".landing-page"
          aria-current={section === "faq" ? "location" : undefined}
        >
          {t("faqNav")}
        </TransitionLink>
        <TransitionLink
          href={publicHref("/tools")}
          revealTarget={'[data-tool-route="hub"]'}
          aria-current={section === "tools" ? "page" : undefined}
        >
          {t("tools")}
        </TransitionLink>
      </nav>
      {onTry ? (
        <NavigationButton
          className="site-try landing-try"
          href={publicHref("/dashboard")}
          disabled={disabled}
          onNavigate={onTry}
          onPrepare={onPrepare}
        >
          {t("try")}
          <ArrowUpRight size={16} />
        </NavigationButton>
      ) : (
        <Button className="site-try" asChild>
          <TransitionLink href={publicHref("/dashboard")} revealTarget=".project-dashboard">
            {t("try")}
            <ArrowUpRight size={16} />
          </TransitionLink>
        </Button>
      )}
    </header>
  );
}
