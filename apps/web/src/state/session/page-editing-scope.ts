import { isPublishedComposition, type Composition, type EnginePort } from "@musart/core";

const independent = new Set(["rulers", "background", "backgroundGradient"]);

/** Paint and ruler metadata do not replace the immutable scope of layer/property controls. */
export function samePageEditingScope(a: Composition, b: Composition): boolean {
  if (a === b) return true;
  if (!isPublishedComposition(a) || !isPublishedComposition(b) || a.layers !== b.layers)
    return false;
  const fields = Object.keys(a).filter((key) => !independent.has(key)) as (keyof Composition)[];
  return (
    fields.length === Object.keys(b).filter((key) => !independent.has(key)).length &&
    fields.every((key) => Object.hasOwn(b, key) && Object.is(a[key], b[key]))
  );
}

/** Resolve the authoritative page; artwork/settings replacements and loads remain stale. */
export function resolvePageEditingScope(engine: EnginePort, page: Composition): Composition | null {
  const snapshot = engine.getSnapshot();
  if (snapshot.pageId !== page.id) return null;
  const current = snapshot.project.pages.find((item) => item.id === page.id);
  return current && samePageEditingScope(page, current) ? current : null;
}
