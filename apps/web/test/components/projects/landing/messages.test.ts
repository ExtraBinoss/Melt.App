import { expect, test } from "vitest";
import { messages } from "../../../../src/components/projects/landing/messages";

test("all landing languages provide matching nonempty interface strings", () => {
  const keys = Object.keys(messages.en).sort();
  for (const catalog of Object.values(messages)) {
    expect(Object.keys(catalog).sort()).toEqual(keys);
    for (const value of Object.values(catalog)) {
      expect(value).toBeTypeOf("string");
      expect(String(value).trim()).not.toBe("");
    }
  }
});
