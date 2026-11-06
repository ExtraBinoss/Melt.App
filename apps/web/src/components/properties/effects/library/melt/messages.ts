import { localeResources } from "../../../../../state/i18n/feature-resources";
import base from "./messages.json";

export const messages = localeResources(
  base,
  import.meta.glob("./locales/*.json", { eager: true, import: "default" }),
);
