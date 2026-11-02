import { expect, test } from "vitest";
import { i18n } from "../../../src/state/i18n";
import { messages } from "../../../src/components/search/messages";
test("registers matching English and French search resources", () => {
  expect(Object.keys(messages.en).sort()).toEqual(Object.keys(messages.fr).sort());
  function check(language: string, resource: Record<string, unknown>, prefix = "") {
    for (const [key, value] of Object.entries(resource)) {
      const path = `${prefix}${key}`;
      if (typeof value === "string") {
        expect(value.length).toBeGreaterThan(0);
        expect(i18n.getResource(language, "search", path)).toBe(value);
      } else check(language, value as Record<string, unknown>, `${path}.`);
    }
  }
  for (const language of ["en", "fr"] as const) check(language, messages[language]);
  for (const key of ["descriptions", "effectDescriptions"] as const)
    expect(Object.keys(messages.en[key]).sort()).toEqual(Object.keys(messages.fr[key]).sort());
});
