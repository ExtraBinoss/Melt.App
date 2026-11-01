import { defaultLocale, isSupportedLocale, type Locale } from "./locales";

/** Preserve the legacy preference key; the functional cookie also makes the first SSR frame localizable. */
export const LANGUAGE_KEY = "musart.language";
export const languageCookiePath = import.meta.env.BASE_URL;
export function localeCookie(language: Locale, secure = false): string {
  return `${LANGUAGE_KEY}=${language}; Path=${languageCookiePath}; Max-Age=31536000; SameSite=Lax${secure ? "; Secure" : ""}`;
}
export function readLocaleCookie(cookie: string): Locale | undefined {
  const value = cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${LANGUAGE_KEY}=`))
    ?.slice(LANGUAGE_KEY.length + 1);
  try {
    const language = decodeURIComponent(value ?? "");
    return isSupportedLocale(language) ? language : undefined;
  } catch {
    return undefined;
  }
}
export function documentLocale(): Locale {
  const value =
    typeof document === "undefined" ? undefined : document.documentElement.dataset.initialLocale;
  return isSupportedLocale(value) ? value : defaultLocale;
}
export function saveLanguage(language: Locale): void {
  try {
    localStorage.setItem(LANGUAGE_KEY, language);
  } catch {
    /* The live locale still works. */
  }
  try {
    document.cookie = localeCookie(language, location.protocol === "https:");
  } catch {
    /* Blocked cookies retain client-only preference behavior. */
  }
}
export function savedLanguage(): Locale {
  try {
    const value = localStorage.getItem(LANGUAGE_KEY);
    if (isSupportedLocale(value)) return value;
  } catch {
    /* Try the functional cookie. */
  }
  try {
    return readLocaleCookie(document.cookie) ?? defaultLocale;
  } catch {
    return defaultLocale;
  }
}
