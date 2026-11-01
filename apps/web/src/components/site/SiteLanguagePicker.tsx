import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { ComponentType, ComponentProps } from "react";
import { ChevronDown } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useHydrated } from "@tanstack/react-router";
import { changeLanguage } from "../../state/i18n";
import { isSupportedLocale, supportedLocales } from "../../state/i18n/locales";
import type { SelectField } from "../shared/SelectField";
import { Button } from "../ui/button";

type Picker = ComponentType<ComponentProps<typeof SelectField>>;
/** Fetch the genuine shared picker as the footer approaches; its SSR label stays accessible. */
export function SiteLanguagePicker() {
  const { t, i18n } = useTranslation("site");
  const host = useRef<HTMLDivElement>(null),
    alive = useRef(true),
    pending = useRef<Promise<void> | null>(null);
  const restoreFocus = useRef(false);
  const id = useId();
  const hydrated = useHydrated();
  const [Picker, setPicker] = useState<Picker | null>(null);
  const [failed, setFailed] = useState(false);
  const language = i18n.language.split("-")[0]!;
  const load = useCallback(() => {
    pending.current ??= import("../shared/SelectField")
      .then((module) => {
        if (alive.current) {
          setFailed(false);
          restoreFocus.current = host.current?.contains(document.activeElement) ?? false;
          setPicker(() => module.SelectField);
        }
      })
      .catch((error: unknown) => {
        pending.current = null;
        if (alive.current) {
          setFailed(true);
          console.error("Language picker failed to load.", error);
        }
      });
  }, []);
  useEffect(() => {
    alive.current = true;
    if (typeof IntersectionObserver === "undefined") load();
    const observer =
      typeof IntersectionObserver === "undefined"
        ? null
        : new IntersectionObserver(
            (entries) => {
              if (entries.some((entry) => entry.isIntersecting)) {
                load();
                observer?.disconnect();
              }
            },
            { rootMargin: "240px" },
          );
    if (host.current) observer?.observe(host.current);
    return () => {
      alive.current = false;
      observer?.disconnect();
    };
  }, [load]);
  useEffect(() => {
    if (Picker && restoreFocus.current) {
      document.getElementById(id)?.focus({ preventScroll: true });
      restoreFocus.current = false;
    }
  }, [Picker, id]);
  return (
    <div ref={host} className="site-languages" onPointerEnter={load} onFocus={load}>
      {Picker ? (
        <Picker
          id={id}
          label={t("language")}
          value={language}
          scrollButtons={false}
          options={supportedLocales.map((locale) => ({
            value: locale.code,
            label: <span lang={locale.code}>{locale.label}</span>,
          }))}
          onValueChange={(value) => {
            if (isSupportedLocale(value)) void changeLanguage(value);
          }}
        />
      ) : (
        <Button
          id={id}
          variant="outline"
          aria-label={t("language")}
          onClick={load}
          className="site-language-pending"
          disabled={!hydrated}
        >
          {supportedLocales.find((locale) => locale.code === language)?.label ?? language}
          <ChevronDown size={14} />
        </Button>
      )}
      {failed && <span role="status">{t("error", { ns: "translation" })}</span>}
    </div>
  );
}
