import { expect, test } from "vitest";
import { getEffectDefinition } from "@musart/core";
import { i18n } from "../../../../src/state/i18n";
import "../../../../src/components/properties/effects/library-messages";
import "../../../../src/components/properties/effects/messages";
test("all new still-image controls and names resolve in every supported locale", () => {
  for (const language of ["en", "fr", "de", "es", "it", "pt", "nl", "pl", "ja", "ko", "zh", "ar"])
    for (const type of ["ink-bleed", "pixel-sort", "edge-detect"] as const) {
      expect(i18n.getResource(language, `${type}Fx`, "name")).toBeTypeOf("string");
      for (const parameter of getEffectDefinition(type).parameters) {
        if (!parameter.labelKey.includes(":")) continue;
        const [namespace, key] = parameter.labelKey.split(":");
        expect(
          i18n.getResource(language, namespace!, key!),
          `${language} ${parameter.labelKey}`,
        ).toBeTypeOf("string");
        if (parameter.kind === "select")
          for (const option of parameter.options) {
            const [ns, k] = option.labelKey.split(":");
            expect(
              i18n.getResource(language, ns!, k!),
              `${language} ${option.labelKey}`,
            ).toBeTypeOf("string");
          }
      }
    }
});
