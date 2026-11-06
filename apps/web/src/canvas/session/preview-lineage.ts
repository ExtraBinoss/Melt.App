import type { Composition, Project } from "@musart/core";
import type { PreviewValue } from "../../state/session/preview-source";

const pagePaint = new Set(["background", "backgroundGradient", "spatial", "effects"]);
const layerPaint = new Set([
  "fill",
  "stroke",
  "fillGradient",
  "strokeWidth",
  "opacity",
  "visible",
  "radius",
  "effects",
  "text",
  "width",
  "height",
  "fontFamily",
  "fontSize",
  "fontWeight",
  "lineHeight",
  "letterSpacing",
  "textAlign",
  "spatial",
]);

/** Lets real property frames finish while newer samples coalesce, including async glyph geometry. */
export class PaintPreviewLineage {
  private current: {
    project: Project;
    source: Composition;
    selection: readonly string[];
    scope: string;
    token: object;
    assets: PreviewValue["assets"];
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
    // Native source replacement is a new scope; depth, bevel, transforms and material
    // values remain one gesture even though some require asynchronous preparation.
    const nativeSource =
      preview.target !== "page" && preview.patch.spatial
        ? [preview.patch.spatial.enabled, preview.patch.spatial.source]
        : null;
    const scope = JSON.stringify([preview.target, ids, keys, nativeSource]);
    const previous = this.current;
    if (
      previous?.project === project &&
      previous.source === source &&
      previous.selection === selection &&
      previous.scope === scope &&
      previous.assets === preview.assets
    )
      return previous.token;
    const token = {};
    this.current = { project, source, selection, scope, token, assets: preview.assets };
    return token;
  }
}
