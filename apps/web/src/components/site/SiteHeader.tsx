import { ArrowUpRight } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { brand } from "../../ui/brand/config";
import { MeltLogo } from "../../ui/brand/MeltLogo";
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
      <a href={landing ? "#musart-intro" : publicHref("/")} className="landing-brand">
        <MeltLogo size={30} interactive />
        {brand.name}
      </a>
      <nav aria-label={t("resources")}>
        <a
          href={publicHref("/#features")}
          aria-current={section === "features" ? "location" : undefined}
        >
          {t("features")}
        </a>
        <a href={publicHref("/#faq")} aria-current={section === "faq" ? "location" : undefined}>
          {t("faqNav")}
        </a>
        <a href={publicHref("/tools")} aria-current={section === "tools" ? "page" : undefined}>
          {t("tools")}
        </a>
      </nav>
      {onTry ? (
        <Button
          className="site-try landing-try"
          disabled={disabled}
          onClick={onTry}
          onPointerEnter={onPrepare}
          onFocus={onPrepare}
        >
          {t("try")}
          <ArrowUpRight size={16} />
        </Button>
      ) : (
        <Button className="site-try" asChild>
          <a href={publicHref("/dashboard")}>
            {t("try")}
            <ArrowUpRight size={16} />
          </a>
        </Button>
      )}
    </header>
  );
}
