import { expect, test } from "vitest";
import { budgetFraction, performanceDomainIds } from "../../../src/canvas/performance/definitions";
import { messages } from "../../../src/canvas/performance/messages";
import { performanceSnapshot } from "./fixtures";

test("compares independently measured duration to budget and admits future metric domains", () => {
  expect(budgetFraction(4, 16)).toBe(0.25);
  expect(budgetFraction(40, 16)).toBe(1);
  expect(budgetFraction(null, 16)).toBe(0);
  expect(budgetFraction(Number.NaN, 16)).toBe(0);
  expect(budgetFraction(4, 0)).toBe(0);
  const metric = performanceSnapshot("scene").metrics[0]!;
  expect(performanceDomainIds([metric, { ...metric, domain: "future" }])).toEqual([
    "scene",
    "images",
    "videos",
    "shapes",
    "text",
    "animation",
    "audio",
    "gpu",
    "future",
  ]);
});

function leaves(value: Record<string, unknown>, prefix = ""): Record<string, string> {
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, item]) => {
      const path = `${prefix}${key}`;
      return typeof item === "string"
        ? [[path, item]]
        : Object.entries(leaves(item as Record<string, unknown>, `${path}.`));
    }),
  );
}

test("all twelve feature locales translate every measurement and preserve interpolation values", () => {
  const base = leaves(messages.en);
  for (const language of ["en", "fr", "de", "es", "it", "pt", "nl", "pl", "ja", "ko", "zh", "ar"]) {
    const translated = leaves(messages[language]!);
    expect(Object.keys(translated).sort()).toEqual(Object.keys(base).sort());
    for (const [key, value] of Object.entries(translated)) {
      expect(value.trim(), `${language}:${key}`).not.toBe("");
      expect(value.match(/\{\{[^}]+\}\}/g) ?? [], `${language}:${key}`).toEqual(
        base[key]!.match(/\{\{[^}]+\}\}/g) ?? [],
      );
    }
  }
});
