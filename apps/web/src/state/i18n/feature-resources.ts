import i18n from "i18next";
import { brand } from "../../ui/brand/config";

type FeatureMessages = Record<string, Record<string, unknown>>;
const pending = new Map<string, FeatureMessages>();
let listening = false;

function brandValues(value: unknown): unknown {
  if (typeof value === "string")
    return value
      .replaceAll("{{brandName}}", brand.name)
      .replaceAll("{{brandNameUpper}}", brand.name.toUpperCase());
  if (Array.isArray(value)) return value.map(brandValues);
  if (value && typeof value === "object")
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, brandValues(item)]));
  return value;
}

/** Discover only this feature's JSON files, retaining typed base-language exports. */
export function localeResources<T extends FeatureMessages>(
  base: T,
  modules: Record<string, unknown>,
): T & FeatureMessages {
  const resources: FeatureMessages = { ...base };
  for (const [path, resource] of Object.entries(modules)) {
    const language = /\/([^/]+)\.json$/.exec(path)?.[1];
    if (language && resource && typeof resource === "object" && !Array.isArray(resource))
      resources[language] = resource as Record<string, unknown>;
  }
  return brandValues(resources) as T & FeatureMessages;
}

function install(namespace: string, messages: FeatureMessages) {
  for (const [language, resource] of Object.entries(messages))
    i18n.addResourceBundle(language, namespace, resource, true, true);
}
function flush() {
  for (const [namespace, messages] of pending) install(namespace, messages);
}

/** Feature imports own their resources; every locale shares the same app preference. */
export function registerFeatureTranslations(namespace: string, messages: FeatureMessages): void {
  // Reinitializing the shared i18next instance (including dev HMR) replaces its
  // resource store. Retain feature registrations so their labels remain available.
  const previous = pending.get(namespace) ?? {};
  const merged = { ...previous };
  for (const [language, resource] of Object.entries(messages))
    merged[language] = { ...previous[language], ...resource };
  pending.set(namespace, merged);
  if (!listening) {
    listening = true;
    i18n.on("initialized", flush);
  }
  if (i18n.isInitialized) install(namespace, messages);
}
