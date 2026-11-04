import { registerFeatureTranslations } from "../../../state/i18n/feature-resources";
import en from "./locales/en.json";
import fr from "./locales/fr.json";

export const resources = { en, fr };
registerFeatureTranslations("workspaceMode", resources);
