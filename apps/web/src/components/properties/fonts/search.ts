import { createSearchIndex } from "@musart/assets";
import type { FontOption } from "./catalog";
import type { FontCategory } from "./FontCategoryTabs";

/** Empty browsing never builds a text index. Translated categories are resolved once. */
export function createFontSearch(
  fonts: readonly FontOption[],
  label: (category: FontOption["category"]) => string,
) {
  const categories = Object.fromEntries(
    (["sans", "serif", "mono", "display", "handwriting"] as const).map((category) => [
      category,
      label(category),
    ]),
  );
  let index: ReturnType<typeof createSearchIndex<FontOption>> | undefined;
  return (
    query: string,
    category: FontCategory,
    installed: ReadonlySet<string>,
  ): readonly FontOption[] => {
    const filter = (font: FontOption) =>
      category === "all" ||
      (category === "installed" ? installed.has(font.id) : font.category === category);
    if (!query.trim()) return category === "all" ? fonts : fonts.filter(filter);
    index ??= createSearchIndex(fonts, {
      text: (font) => font.label ?? font.family,
      keywords: (font) => `${font.category} ${categories[font.category]}`,
    });
    return index.search(query, { limit: fonts.length, filter });
  };
}
