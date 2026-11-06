import {
  assertBoolean,
  assertColor,
  assertList,
  assertRecord,
  assertText,
  assertUniqueId,
} from "../document/guards";
import type { Project } from "../document/model";
import { ensure } from "../errors";
import { colorOwner, colorTargets, readTargetColor } from "./targets";
import type { DocumentColor, SavedPalette } from "./model";
export function validateDocumentColor(
  value: unknown,
  ids: Set<string>,
): asserts value is DocumentColor {
  assertRecord(value);
  assertUniqueId(value.id, ids);
  assertText(value.name, 100);
  assertColor(value.value);
}
export function validateSavedPalette(value: unknown): asserts value is SavedPalette {
  assertRecord(value);
  assertText(value.id, 160);
  assertText(value.name, 100);
  assertList(value.colors, 32);
  ensure(value.colors.length > 0, "INVALID_DOCUMENT", "Palette is empty");
  const ids = new Set<string>();
  for (const color of value.colors) {
    validateDocumentColor(color, ids);
    if ("locked" in color && color.locked !== undefined) assertBoolean(color.locked);
  }
}
export function validateColorLinks(value: unknown, properties?: readonly string[]): void {
  if (value === undefined) return;
  assertRecord(value);
  ensure(Object.keys(value).length <= 64, "INVALID_DOCUMENT", "Too many color links");
  for (const [property, id] of Object.entries(value)) {
    assertText(property, 100);
    assertText(id, 160);
    ensure(
      !["__proto__", "constructor", "prototype"].includes(property) &&
        (!properties || properties.includes(property)),
      "INVALID_DOCUMENT",
      "Invalid color link property",
    );
  }
}
export function validateProjectColors(project: Project, ids: Set<string>): void {
  if (project.colors !== undefined) {
    assertList(project.colors, 256);
    for (const color of project.colors) validateDocumentColor(color, ids);
  }
  const colors = new Map(project.colors?.map((color) => [color.id, color]));
  for (const { target, colorId } of colorTargets(project)) {
    const owner = colorOwner(project, target),
      color = colors.get(colorId);
    ensure(
      color && readTargetColor(owner, target.property) === color.value,
      "INVALID_DOCUMENT",
      "Unresolved document color link",
    );
  }
}
