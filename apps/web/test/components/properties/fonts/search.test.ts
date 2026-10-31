import { expect, test, vi } from "vitest";
import { FONT_CATALOG } from "@musart/assets";
import { createFontSearch } from "../../../../src/components/properties/fonts/search";

test("browsing does no text indexing and searching reuses its index and five translated categories", () => {
  const name = vi.fn(() => "Needle"),
    label = vi.fn((category: string) => (category === "sans" ? "bâton" : category));
  const fonts = [
    ...FONT_CATALOG,
    {
      id: "test",
      get family() {
        return name();
      },
      category: "sans" as const,
    },
  ];
  const search = createFontSearch(fonts, label),
    installed = new Set(["inter"]);
  expect(search("", "all", installed)).toBe(fonts);
  expect(search(" ", "installed", installed).map((font) => font.id)).toEqual(["inter"]);
  expect(search("", "serif", installed).every((font) => font.category === "serif")).toBe(true);
  expect(name).not.toHaveBeenCalled();
  expect(label).toHaveBeenCalledTimes(5);
  expect(search("needle", "all", installed).map((font) => font.id)).toEqual(["test"]);
  const reads = name.mock.calls.length;
  expect(search("baton", "all", installed).some((font) => font.id === "inter")).toBe(true);
  expect(search("needle", "installed", installed)).toEqual([]);
  expect(name).toHaveBeenCalledTimes(reads);
  expect(label).toHaveBeenCalledTimes(5);
});
