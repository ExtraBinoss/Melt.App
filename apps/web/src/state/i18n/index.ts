import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { translations } from "./catalogs";
import { documentLocale, savedLanguage, saveLanguage } from "./preference";
import { defaultLocale, localeDirection, supportedLocales, type Locale } from "./locales";

export function readLanguage(): Locale {
  return savedLanguage();
}
// The client starts with the locale embedded by SSR; the server registry remains deterministic.
void i18n.use(initReactI18next).init({
  resources: translations,
  lng: documentLocale(),
  fallbackLng: defaultLocale,
  supportedLngs: supportedLocales.map(({ code }) => code),
  interpolation: { escapeValue: false },
  initAsync: false,
});
export async function changeLanguage(language: Locale) {
  saveLanguage(language);
  await i18n.changeLanguage(language);
  if (typeof document !== "undefined") {
    document.documentElement.lang = language;
    document.documentElement.dir = localeDirection(language);
  }
}
export { i18n };
