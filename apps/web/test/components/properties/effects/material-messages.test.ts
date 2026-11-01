import { expect, it } from "vitest";
import { getEffectDefinition } from "@musart/core";
import { i18n } from "../../../../src/state/i18n";
import { supportedLocales } from "../../../../src/state/i18n/locales";
import "../../../../src/components/properties/effects/library-messages";
import "../../../../src/components/properties/effects/messages";
it("translates every new effect, input, parameter and choice in all supported locales", () => {
  for (const locale of supportedLocales)
    for (const type of ["bevel", "displace", "thermal"] as const) {
      for (const key of [
        `${type}Fx:name`,
        ...getEffectDefinition(type).parameters.flatMap((parameter) => [
          parameter.labelKey,
          ...(parameter.kind === "select"
            ? parameter.options.map((option) => option.labelKey)
            : []),
        ]),
        ...(getEffectDefinition(type).inputs ?? []).map((input) => input.labelKey),
      ]) {
        expect(
          i18n.exists(key, { lng: locale.code, ns: "effectControls", fallbackLng: false }),
          `${locale.code}: ${key}`,
        ).toBe(true);
      }
    }
});
