import type { CommandCommitInfo, Layer, SessionSnapshot } from "@musart/core";
import type { CanonicalContinuation } from "../render/frame-request";
import type { PreviewValue } from "../../state/session/preview-source";

const scalarFields = new Set<keyof Layer>([
  "fill",
  "fillGradient",
  "stroke",
  "strokeWidth",
  "opacity",
  "visible",
  "radius",
  "effects",
]);
function sameScope(before: SessionSnapshot, after: SessionSnapshot): boolean {
  if (
    before.project.id !== after.project.id ||
    before.pageId !== after.pageId ||
    before.project.assets !== after.project.assets ||
    before.selection.length !== after.selection.length ||
    before.selection.some((id, index) => id !== after.selection[index])
  )
    return false;
  const a = before.project.pages.find((page) => page.id === before.pageId),
    b = after.project.pages.find((page) => page.id === after.pageId);
  return (
    !!a &&
    !!b &&
    a.width === b.width &&
    a.height === b.height &&
    a.colorSpace === b.colorSpace &&
    a.layers.length === b.layers.length &&
    a.layers.every((layer, index) => {
      const next = b.layers[index]!;
      return (
        layer.id === next.id &&
        layer.kind === next.kind &&
        layer.parentId === next.parentId &&
        layer.assetId === next.assetId &&
        layer.mask?.layerId === next.mask?.layerId &&
        layer.mask?.assetId === next.mask?.assetId &&
        layer.spatialContext === next.spatialContext &&
        layer.effects.length === next.effects.length &&
        layer.effects.every(
          (effect, at) =>
            effect.id === next.effects[at]!.id && effect.type === next.effects[at]!.type,
        )
      );
    })
  );
}

/** No guesses from project identity: only actual ordered engine summaries extend this lease. */
export class CanonicalFrameLineage {
  private token: CanonicalContinuation | undefined;
  private mode: "history" | "scalar" | undefined;
  private suspendedFields: string | undefined;
  private retirement: object | null = null;
  private base: CanonicalContinuation | undefined;
  constructor(private snapshot: SessionSnapshot) {}
  get baseContinuation() {
    return this.base;
  }
  private retire(): void {
    this.token = undefined;
    this.mode = undefined;
    this.suspendedFields = undefined;
    this.base = undefined;
    this.retirement = null;
  }
  accept(event: CommandCommitInfo): void {
    const mode =
      event.kind === "undo" || event.kind === "redo"
        ? "history"
        : event.kind === "commit" &&
            event.types.length > 0 &&
            event.types.every((type) => type === "updateLayers" || type === "updateLayerPatches") &&
            !!event.layerFields?.length &&
            event.layerFields.every((field) => scalarFields.has(field))
          ? "scalar"
          : undefined;
    const continues =
      mode &&
      event.snapshot.revision === this.snapshot.revision + 1 &&
      sameScope(this.snapshot, event.snapshot);
    const compatible =
      !this.suspendedFields ||
      (mode === "scalar" &&
        [...(event.layerFields ?? [])].sort().join(",") === this.suspendedFields);
    this.token = continues
      ? compatible && this.mode === mode && this.token
        ? this.token
        : ({} as CanonicalContinuation)
      : undefined;
    this.mode = continues ? mode : undefined;
    this.suspendedFields = undefined;
    this.retirement = null;
    this.base = undefined;
    this.snapshot = event.snapshot;
  }
  read(
    snapshot: SessionSnapshot,
    canonical: boolean,
    preview?: PreviewValue | null,
  ): CanonicalContinuation | undefined {
    // State observers run before commit summaries. Reading that pending revision
    // must not consume the authoritative predecessor that accept() still needs.
    const pending =
      this.snapshot.project !== snapshot.project || this.snapshot.revision !== snapshot.revision;
    this.base = undefined;
    if (!pending && this.snapshot !== snapshot) {
      this.retire();
      this.snapshot = snapshot;
    }
    if (!canonical) {
      const keys = preview && preview.target !== "page" ? Object.keys(preview.patch).sort() : [];
      if (
        !pending &&
        keys.length &&
        keys.every((key) => scalarFields.has(key as keyof Layer)) &&
        this.mode === "scalar" &&
        this.token &&
        !this.retirement
      ) {
        this.suspendedFields = keys.join(",");
        this.base = this.token;
      } else this.retire();
      return undefined;
    }
    if (pending) return undefined;
    if (this.suspendedFields) {
      this.base = this.token;
      if (!this.retirement) {
        const ticket = (this.retirement = {});
        queueMicrotask(() => {
          if (this.retirement === ticket) this.retire();
        });
      }
      return undefined;
    }
    return this.token;
  }
}
