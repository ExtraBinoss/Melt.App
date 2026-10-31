import {
  localeResources,
  registerFeatureTranslations,
} from "../../../state/i18n/feature-resources";
import en from "./locales/library/en.json";
import fr from "./locales/library/fr.json";

export const messages = localeResources(
  { en, fr },
  import.meta.glob("./locales/library/*.json", { eager: true, import: "default" }),
);
registerFeatureTranslations("library", messages);
