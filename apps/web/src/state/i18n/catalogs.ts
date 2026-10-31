import { localeResources } from "./feature-resources";
import en from "./locales/common/en.json";
import fr from "./locales/common/fr.json";
import { interfaceV2 } from "./interface-v2";
import { projectMessages } from "./projects";

const common = localeResources(
  { en, fr },
  import.meta.glob("./locales/common/*.json", { eager: true, import: "default" }),
);
type Catalog = typeof en & typeof interfaceV2.en & typeof projectMessages.en;

const languages = new Set([
  ...Object.keys(common),
  ...Object.keys(interfaceV2),
  ...Object.keys(projectMessages),
]);
export const translations = Object.fromEntries(
  [...languages].map((language) => [
    language,
    {
      translation: { ...interfaceV2[language], ...projectMessages[language], ...common[language] },
    },
  ]),
) as Record<string, { translation: Catalog }>;
