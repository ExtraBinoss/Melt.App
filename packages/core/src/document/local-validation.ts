import type { Project } from "./model";
import { isPublishedProject } from "./published";
import { ensure } from "../errors";
import { validateLayer, validatePageMetadata, validateProjectMetadata } from "./validation";

export interface LocalValidationScope {
  pages: ReadonlyMap<string, { metadata: boolean; layers: ReadonlySet<string> }>;
}
/**
 * Only the engine's closed scalar mutation allowlist may use this path. IDs, references,
 * capabilities and all unvisited resources are inherited from the validated frozen base.
 * Arbitrary frozen/imported documents must always use validateProject instead.
 */
export function validateLocalProject(
  base: Project,
  draft: Project,
  scope: LocalValidationScope,
): void {
  ensure(
    isPublishedProject(base),
    "INVALID_DOCUMENT",
    "Local validation requires a certified base",
  );
  ensure(
    base.id === draft.id &&
      base.version === draft.version &&
      base.assets === draft.assets &&
      base.replay === draft.replay &&
      base.createdAt === draft.createdAt &&
      base.pages.length === draft.pages.length,
    "INVALID_DOCUMENT",
    "Local edit changed a structural domain",
  );
  validateProjectMetadata(draft as unknown as Record<string, unknown>);
  for (const [id, touched] of scope.pages) {
    const page = draft.pages.find((item) => item.id === id);
    ensure(page, "NOT_FOUND", "Composition introuvable");
    if (touched.metadata) validatePageMetadata(page as unknown as Record<string, unknown>);
    if (!touched.layers.size) continue;
    for (const layer of page.layers) {
      if (!touched.layers.has(layer.id)) continue;
      // Nested identities are unchanged. A fresh local set still checks the layer's own
      // guide/effect uniqueness without copying or walking the global identity index.
      validateLayer(layer, new Set(), draft.assets);
    }
  }
}
