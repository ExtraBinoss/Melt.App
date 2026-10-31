import { localeResources } from "./feature-resources";
import en from "./locales/interface-v2/en.json";
import fr from "./locales/interface-v2/fr.json";

export const interfaceV2 = localeResources(
  { en, fr },
  import.meta.glob("./locales/interface-v2/*.json", { eager: true, import: "default" }),
);
