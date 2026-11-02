import { expect, test } from "vitest";
import { messages } from "../../../../src/components/projects/preferences/messages";
test("preferences categories and editor explanations have matching English and French resources", () => {
  for (const catalog of Object.values(messages)) {
    expect(Object.keys(catalog).sort()).toEqual(Object.keys(messages.en).sort());
    for (const value of Object.values(catalog)) {
      expect(value).toBeTypeOf("string");
      expect(String(value).trim()).not.toBe("");
    }
  }
});
