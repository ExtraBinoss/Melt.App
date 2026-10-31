import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { translations } from "./catalogs";
import {
  defaultLocale,
  isSupportedLocale,
  localeDirection,
  supportedLocales,
  type Locale,
} from "./locales";

export function readLanguage(): Locale {
  try {
    const language = localStorage.getItem("musart.language");
    return isSupportedLocale(language) ? language : defaultLocale;
  } catch {
    return defaultLocale;
  }
}
// SSR and the first client render agree; mounted routes restore the saved preference.
void i18n.use(initReactI18next).init({
  resources: translations,
  lng: defaultLocale,
  fallbackLng: defaultLocale,
  supportedLngs: supportedLocales.map(({ code }) => code),
  interpolation: { escapeValue: false },
  initAsync: false,
});
export async function changeLanguage(language: Locale) {
  await i18n.changeLanguage(language);
  if (typeof document !== "undefined") {
    document.documentElement.lang = language;
    document.documentElement.dir = localeDirection(language);
  }
  try {
    localStorage.setItem("musart.language", language);
  } catch {
    /* Session language remains usable. */
  }
}
export { i18n };
