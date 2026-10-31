import { localeResources, registerFeatureTranslations } from "../../state/i18n/feature-resources";
import en from "./locales/copy-button/en.json";
import fr from "./locales/copy-button/fr.json";

export const messages = localeResources(
  { en, fr },
  import.meta.glob("./locales/copy-button/*.json", { eager: true, import: "default" }),
);
registerFeatureTranslations("copyButton", messages);
