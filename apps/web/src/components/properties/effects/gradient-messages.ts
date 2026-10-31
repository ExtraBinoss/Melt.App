import {
  localeResources,
  registerFeatureTranslations,
} from "../../../state/i18n/feature-resources";
import en from "./locales/gradient/en.json";
import fr from "./locales/gradient/fr.json";

export const messages = localeResources(
  { en, fr },
  import.meta.glob("./locales/gradient/*.json", { eager: true, import: "default" }),
);
registerFeatureTranslations("gradientFx", messages);
export const gradientFxEn = messages.en;
export const gradientFxFr = messages.fr;
