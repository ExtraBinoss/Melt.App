import { expect, test, vi } from "vitest";

const instance = vi.hoisted(() => ({
  isInitialized: false,
  addResourceBundle: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
}));
vi.mock("i18next", () => ({ default: instance }));
import { registerFeatureTranslations } from "../../../src/state/i18n/feature-resources";

test("retains every early namespace registration and accepts additional locale codes", () => {
  const first = { en: { retained: "Keep" }, fr: { retained: "Garder" } };
  const second = { en: { nested: { added: "Added" } }, ja: { nested: { added: "追加" } } };
  registerFeatureTranslations("deferred", first);
  registerFeatureTranslations("deferred", second);
  expect(instance.addResourceBundle).not.toHaveBeenCalled();
  expect(instance.on).toHaveBeenCalledOnce();
  const [event, flush] = instance.on.mock.calls[0]! as [string, () => void];
  expect(event).toBe("initialized");
  instance.isInitialized = true;
  flush();
  expect(instance.addResourceBundle.mock.calls).toEqual([
    ["en", "deferred", first.en, true, true],
    ["fr", "deferred", first.fr, true, true],
    ["en", "deferred", second.en, true, true],
    ["ja", "deferred", second.ja, true, true],
  ]);
  expect(instance.off).toHaveBeenCalledWith("initialized", flush);
  registerFeatureTranslations("live", { ar: { action: "إنشاء" } });
  expect(instance.addResourceBundle).toHaveBeenLastCalledWith(
    "ar",
    "live",
    { action: "إنشاء" },
    true,
    true,
  );
});
