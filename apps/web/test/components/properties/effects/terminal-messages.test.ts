import { expect, test } from "vitest";
import { getEffectDefinition } from "@musart/core";
import { i18n } from "../../../../src/state/i18n";
import "../../../../src/components/properties/effects/library-messages";

for (const language of ["en", "fr"])
  test(`Terminal controls and cursor choices are translated in ${language}`, () => {
    expect(i18n.getResource(language, "terminalFx", "name")).toBe("Terminal");
    for (const parameter of getEffectDefinition("terminal").parameters) {
      if (parameter.labelKey.includes(":")) {
        const [namespace, key] = parameter.labelKey.split(":");
        expect(i18n.getResource(language, namespace!, key!)).toBeTypeOf("string");
      }
      if (parameter.kind === "select")
        for (const option of parameter.options) {
          const [namespace, key] = option.labelKey.split(":");
          expect(i18n.getResource(language, namespace!, key!)).toBeTypeOf("string");
        }
    }
  });
