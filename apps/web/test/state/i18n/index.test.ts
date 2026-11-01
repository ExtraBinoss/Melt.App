import { beforeEach, expect, test, vi } from "vitest";
import { changeLanguage, i18n, readLanguage } from "../../../src/state/i18n";
beforeEach(() => {
  localStorage.removeItem("musart.language");
  document.cookie = "musart.language=; Max-Age=0; Path=/";
});

test("starts in English before mounted routes restore the saved preference", () => {
  expect(i18n.language).toBe("en");
});

test("changes language and document language together", async () => {
  await changeLanguage("en");
  expect(i18n.t("layers")).toBe("Layers");
  expect(document.documentElement.lang).toBe("en");
  await changeLanguage("fr");
  expect(i18n.t("layers")).toBe("Calques");
});

test("restores a saved language and tolerates unavailable preference storage", async () => {
  localStorage.setItem("musart.language", "en");
  expect(readLanguage()).toBe("en");
  localStorage.setItem("musart.language", "fr");
  expect(readLanguage()).toBe("fr");
  const get = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new Error("Blocked");
  });
  expect(readLanguage()).toBe("en");
  get.mockRestore();
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("Blocked");
  });
  await expect(changeLanguage("en")).resolves.toBeUndefined();
  await changeLanguage("fr");
});

test("defaults missing and invalid preferences to English and restores additional supported locales", async () => {
  expect(readLanguage()).toBe("en");
  localStorage.setItem("musart.language", "invalid");
  expect(readLanguage()).toBe("en");
  localStorage.setItem("musart.language", "ja");
  expect(readLanguage()).toBe("ja");
  await changeLanguage("ar");
  expect(document.documentElement.lang).toBe("ar");
  expect(document.documentElement.dir).toBe("rtl");
  expect(i18n.t("layers")).toBe("Layers");
  expect(localStorage.getItem("musart.language")).toBe("ar");
  await changeLanguage("en");
  expect(document.documentElement.dir).toBe("ltr");
});
