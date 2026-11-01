import { expect, test } from "vitest";
import { registerFeatureTranslations } from "../../../src/state/i18n/feature-resources";
import { i18n } from "../../../src/state/i18n";
test("merges independent feature messages without replacing other namespaces", () => {
  registerFeatureTranslations("feature-test", {
    fr: { action: "Créer", retained: "Valeur" },
    en: { action: "Create", retained: "Value" },
  });
  registerFeatureTranslations("feature-test", {
    fr: { action: "Modifier" },
    en: { action: "Edit" },
  });
  expect(i18n.t("action", { ns: "feature-test", lng: "fr" })).toBe("Modifier");
  expect(i18n.t("retained", { ns: "feature-test", lng: "en" })).toBe("Value");
  expect(i18n.t("export", { lng: "fr" })).toBe("Exporter");
});
test("restores feature labels when initialization replaces the resource store", () => {
  registerFeatureTranslations("feature-reinitialized", {
    fr: { cached: "Sur cet appareil", megabytes: "{{value}} Mo" },
    en: { cached: "On this device", megabytes: "{{value}} MB" },
  });
  i18n.removeResourceBundle("fr", "feature-reinitialized");
  i18n.removeResourceBundle("en", "feature-reinitialized");
  i18n.emit("initialized", i18n.options);
  expect(i18n.t("feature-reinitialized:cached", { lng: "fr" })).toBe("Sur cet appareil");
  expect(i18n.t("feature-reinitialized:megabytes", { lng: "fr", value: 151 })).toBe("151 Mo");
});
