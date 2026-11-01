import { expect, it } from "vitest";
import { getEffectDefinition } from "@musart/core";
import { libraryMessages } from "../../../../src/components/properties/effects/library-messages";
import { i18n } from "../../../../src/state/i18n";
it("registers the scan name and every generated control in all supported locales", () => {
  const resources = libraryMessages["time-warp-scan"];
  expect(Object.keys(resources)).toHaveLength(12);
  for (const language of Object.keys(resources)) {
    const t = i18n.getFixedT(language);
    expect(t("time-warp-scan")).not.toBe("time-warp-scan");
    for (const parameter of getEffectDefinition("time-warp-scan").parameters) {
      if (!("scope" in parameter) || parameter.scope !== "settings") continue;
      expect(t(parameter.labelKey)).not.toBe(parameter.labelKey);
      if (parameter.kind === "select")
        for (const option of parameter.options)
          expect(t(option.labelKey)).not.toBe(option.labelKey);
    }
  }
});
