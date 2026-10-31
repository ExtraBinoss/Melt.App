import { localeResources, registerFeatureTranslations } from "../i18n/feature-resources";
import en from "./locales/motion-confirmation/en.json";
import fr from "./locales/motion-confirmation/fr.json";

export const messages = localeResources(
  { en, fr },
  import.meta.glob("./locales/motion-confirmation/*.json", { eager: true, import: "default" }),
);
registerFeatureTranslations("motionConfirmation", messages);
