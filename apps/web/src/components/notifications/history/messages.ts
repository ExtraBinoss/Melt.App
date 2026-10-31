import {
  localeResources,
  registerFeatureTranslations,
} from "../../../state/i18n/feature-resources";
import en from "./locales/en.json";
import fr from "./locales/fr.json";
export const messages = localeResources(
  { en, fr },
  import.meta.glob("./locales/*.json", { eager: true, import: "default" }),
);
registerFeatureTranslations("historyNotice", messages);
