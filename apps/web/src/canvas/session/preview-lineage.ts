import type { Composition, Project } from "@musart/core";
import type { PreviewValue } from "../../state/session/preview-source";

const pagePaint = new Set(["background", "backgroundGradient"]);
const layerPaint = new Set(["fill", "stroke", "fillGradient"]);

/** Certifies one contiguous paint gesture, never arbitrary still/structural previews. */
export class PaintPreviewLineage {
  private current: {
    project: Project;
    source: Composition;
    selection: readonly string[];
    scope: string;
    token: object;
  } | null = null;

  clear(): void {
    this.current = null;
  }

  read(
    project: Project,
    source: Composition,
    selection: readonly string[],
    preview: PreviewValue | null,
  ): object | undefined {
    const keys = preview ? Object.keys(preview.patch).sort() : [];
    const allowed = preview?.target === "page" ? pagePaint : layerPaint;
    if (!preview || !keys.length || keys.some((key) => !allowed.has(key))) {
      this.clear();
      return undefined;
    }
    const ids =
      preview.target === "page"
        ? []
        : preview.target === "layer"
          ? [preview.layerId]
          : [...preview.layerIds].sort();
    if (
      preview.target !== "page" &&
      (!ids.length || ids.some((id) => !source.layers.some((layer) => layer.id === id)))
    ) {
      this.clear();
      return undefined;
    }
    const scope = JSON.stringify([preview.target, ids, keys]);
    const previous = this.current;
    if (
      previous?.project === project &&
      previous.source === source &&
      previous.selection === selection &&
      previous.scope === scope
    )
      return previous.token;
    const token = {};
    this.current = { project, source, selection, scope, token };
    return token;
  }
}
