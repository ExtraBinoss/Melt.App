import { localeResources } from "./feature-resources";
import en from "./locales/projects/en.json";
import fr from "./locales/projects/fr.json";

export const projectMessages = localeResources(
  { en, fr },
  import.meta.glob("./locales/projects/*.json", { eager: true, import: "default" }),
);
