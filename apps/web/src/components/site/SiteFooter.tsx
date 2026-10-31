import { ArrowUp } from "lucide-react";
import { useHydrated } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { changeLanguage } from "../../state/i18n";
import { supportedLocales, isSupportedLocale } from "../../state/i18n/locales";
import { SelectField } from "../shared/SelectField";
import { MeltLogo } from "../../ui/brand/MeltLogo";
import { brand } from "../../ui/brand/config";
import { TOOL_PAGES, publicHref, toolPath } from "../../tools/catalog";
import "./messages";
import "./site.css";
const repository = "https://github.com/ExtraBinoss/MusArt";
export function SiteFooter() {
  const hydrated = useHydrated();
  const { t, i18n } = useTranslation("site");
  return (
    <footer className="site-footer">
      <div className="site-footer-columns">
        <div className="site-footer-about">
          <a className="landing-footer-brand" href={publicHref("/")}>
            <MeltLogo size={30} />
            {brand.name}
          </a>
          <p>{t("footerDescription")}</p>
        </div>
        <nav aria-label={t("studio")}>
          <h3>{t("studio")}</h3>
          <a href={publicHref("/dashboard")}>{t("templates")}</a>
          <a href={publicHref("/editor")}>{t("editor")}</a>
          <a href={publicHref("/tools")}>{t("tools")}</a>
          <a href={publicHref("/#faq")}>{t("faqNav")}</a>
        </nav>
        <nav aria-label={t("tools")}>
          <h3>{t("tools")}</h3>
          {TOOL_PAGES.map((tool) => (
            <a key={tool.style} href={publicHref(toolPath(tool))}>
              {tool.style === "ascii" || tool.style === "crt"
                ? tool.style.toUpperCase()
                : tool.style[0]!.toUpperCase() + tool.style.slice(1)}
            </a>
          ))}
        </nav>
        <nav aria-label={t("resources")}>
          <h3>{t("resources")}</h3>
          <a href={repository}>{t("code")}</a>
          <a href={`${repository}/blob/main/CHANGELOG.md`}>{t("changes")}</a>
          <a href={`${repository}/issues`}>{t("feedback")}</a>
          <a href={`${repository}/blob/main/LICENSE`}>{t("license")}</a>
          <div className="site-languages">
            <SelectField
              disabled={!hydrated}
              label={t("language")}
              value={i18n.language.split("-")[0]!}
              options={supportedLocales.map((locale) => ({
                value: locale.code,
                label: <span lang={locale.code}>{locale.label}</span>,
              }))}
              onValueChange={(language) => {
                if (isSupportedLocale(language)) void changeLanguage(language);
              }}
            />
          </div>
        </nav>
      </div>
      <div className="site-footer-bottom">
        <span>
          © {new Date().getUTCFullYear()} {brand.name} · {t("footerNote")}
        </span>
        <a
          href="#top"
          onClick={(event) => {
            event.preventDefault();
            document.getElementById("top")?.scrollTo({
              top: 0,
              behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
                ? "instant"
                : "smooth",
            });
          }}
        >
          {t("backTop")}
          <ArrowUp size={13} />
        </a>
      </div>
    </footer>
  );
}
