import { expect, it } from "vitest";
import { messages } from "../../../src/canvas/effects/messages";
import { i18n } from "../../../src/state/i18n";
import { supportedLocales } from "../../../src/state/i18n/locales";
it("translates every radial action and handle hint in all twelve application languages", () => {
  expect(Object.keys(messages).sort()).toEqual(supportedLocales.map(({ code }) => code).sort());
  for (const { code: lng } of supportedLocales) {
    expect(Object.keys(messages[lng]!).sort()).toEqual(Object.keys(messages.en).sort());
    for (const [key, value] of Object.entries(messages[lng]))
      expect(i18n.t(`effectGizmo:${key}`, { lng })).toBe(value);
  }
});
