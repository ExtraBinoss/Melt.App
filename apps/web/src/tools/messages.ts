import { localeResources, registerFeatureTranslations } from "../state/i18n/feature-resources";
import en from "./content/en.json";
import fr from "./content/fr.json";

export const messages = localeResources(
  { en, fr },
  import.meta.glob("./content/*.json", { eager: true, import: "default" }),
);
registerFeatureTranslations("tools", messages);
