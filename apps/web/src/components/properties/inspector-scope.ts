import { isPublishedComposition, type Composition, type EnginePort } from "@musart/core";

/** Background paint and ruler visibility have independent live consumers in the Inspector. */
export function sameInspectorPage(a: Composition, b: Composition): boolean {
  if (a === b) return true;
  if (!isPublishedComposition(a) || !isPublishedComposition(b) || a.layers !== b.layers)
    return false;
  const local = new Set(["rulers", "background", "backgroundGradient"]);
  const fields = Object.keys(a).filter((key) => !local.has(key)) as (keyof Composition)[];
  return (
    fields.length === Object.keys(b).filter((key) => !local.has(key)).length &&
    fields.every((key) => Object.hasOwn(b, key) && Object.is(a[key], b[key]))
  );
}

/** Resolve the authoritative page; artwork/settings replacements and loads remain stale. */
export function resolveInspectorPage(engine: EnginePort, page: Composition): Composition | null {
  const snapshot = engine.getSnapshot();
  if (snapshot.pageId !== page.id) return null;
  const current = snapshot.project.pages.find((item) => item.id === page.id);
  return current && sameInspectorPage(page, current) ? current : null;
}
