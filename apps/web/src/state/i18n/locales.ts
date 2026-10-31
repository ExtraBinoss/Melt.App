/** Add a locale after its public site, landing and tool JSON resources are complete. */
export const supportedLocales = [
  { code: "en", label: "English", englishLabel: "English" },
  { code: "fr", label: "Français", englishLabel: "French" },
  { code: "de", label: "Deutsch", englishLabel: "German" },
  { code: "es", label: "Español", englishLabel: "Spanish" },
  { code: "it", label: "Italiano", englishLabel: "Italian" },
  { code: "pt", label: "Português", englishLabel: "Portuguese" },
  { code: "nl", label: "Nederlands", englishLabel: "Dutch" },
  { code: "pl", label: "Polski", englishLabel: "Polish" },
  { code: "ja", label: "日本語", englishLabel: "Japanese" },
  { code: "ko", label: "한국어", englishLabel: "Korean" },
  { code: "zh", label: "中文", englishLabel: "Chinese" },
  { code: "ar", label: "العربية", englishLabel: "Arabic" },
] as const;
export type Locale = (typeof supportedLocales)[number]["code"];
export const defaultLocale: Locale = "en";

export function isSupportedLocale(value: unknown): value is Locale {
  return typeof value === "string" && supportedLocales.some((locale) => locale.code === value);
}
export function localeDirection(language: string): "ltr" | "rtl" {
  return language.split("-")[0] === "ar" ? "rtl" : "ltr";
}
