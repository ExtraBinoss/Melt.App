import { isPublishedComposition, type Composition } from "@musart/core";

const metadata = new Set(["rulers", "name", "canvasPosition"]);
/** Workspace metadata never changes composed pixels; actual rendering inputs retain identity. */
export function sameCompositionInput(before: Composition | undefined, after: Composition): boolean {
  if (before === after) return true;
  if (!before || !isPublishedComposition(before) || !isPublishedComposition(after)) return false;
  const fields = Object.keys(before).filter(
    (field) => !metadata.has(field),
  ) as (keyof Composition)[];
  return (
    fields.length === Object.keys(after).filter((field) => !metadata.has(field)).length &&
    fields.every((field) => Object.hasOwn(after, field) && Object.is(before[field], after[field]))
  );
}
