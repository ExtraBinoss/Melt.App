import { expect, test } from "vitest";
import {
  libraryPreviewHref,
  readLibraryPreview,
} from "../../../../src/components/projects/items/links";
test("preview links round-trip durable project/template IDs without embedding display names or document data", () => {
  for (const kind of ["project", "template"] as const) {
    const request = { kind, id: "a / & ? é" };
    const href = libraryPreviewHref(request);
    expect(href.startsWith("/dashboard?")).toBe(true);
    expect(readLibraryPreview(new URL(href, "https://melt.test").search)).toEqual(request);
  }
  for (const query of [
    "",
    "?preview=other&item=a",
    "?preview=project",
    "?preview=template&item=",
    `?preview=project&item=${"a".repeat(201)}`,
  ])
    expect(readLibraryPreview(query)).toBeNull();
});
