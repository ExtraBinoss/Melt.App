import type { LibraryItem } from "../../../services/projects/library/favorites";
import { dashboardHref } from "../../../ui/navigation/activation";
export type LibraryPreviewRequest = Pick<LibraryItem, "kind" | "id">;
export function libraryPreviewHref(item: LibraryPreviewRequest) {
  return `${dashboardHref}?${new URLSearchParams({ preview: item.kind, item: item.id })}`;
}
export function readLibraryPreview(search = location.search): LibraryPreviewRequest | null {
  const query = new URLSearchParams(search),
    kind = query.get("preview"),
    id = query.get("item");
  return (kind === "project" || kind === "template") && id && id.length <= 200
    ? { kind, id }
    : null;
}
