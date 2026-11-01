import type { Command, Layer, Project } from "../document/model";
import { spatialReplacementPreservesScope } from "./spatial-scope";

/** Fields whose edits cannot add identities or alter graph/animation addresses. */
const layerFields = new Set<string>([
  "name",
  "x",
  "y",
  "width",
  "height",
  "rotation",
  "scaleX",
  "scaleY",
  "affine",
  "opacity",
  "visible",
  "locked",
  "fill",
  "stroke",
  "strokeWidth",
  "radius",
  "blendMode",
  "text",
  "fontFamily",
  "fontSize",
  "fontWeight",
  "lineHeight",
  "letterSpacing",
  "textAlign",
  "margin",
  "padding",
  "spatial",
] satisfies (keyof Layer)[]);
const pageFields = new Set([
  "name",
  "width",
  "height",
  "background",
  "backgroundGradient",
  "margins",
  "rulers",
  "colorSpace",
  "canvasPosition",
]);
function hasOnlyFields(
  value: unknown,
  fields: ReadonlySet<string>,
): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).every((key) => fields.has(key))
  );
}
export interface LocalPageMutationScope {
  metadata: boolean;
  layers: Set<string>;
}
export interface LocalMutationScope {
  kind: "local";
  /** All local commands preserve IDs, references, layer order and active page. */
  pages: Map<string, LocalPageMutationScope>;
}
export type CommandMutationScope = LocalMutationScope | { kind: "full" };
type LayerLookup = (id: string) => Layer | undefined;
function localLayerPatch(value: unknown, ids: readonly string[], lookup: LayerLookup): boolean {
  if (!hasOnlyFields(value, layerFields)) return false;
  if (!Object.hasOwn(value, "spatial")) return true;
  const spatial = value.spatial;
  return ids.every((id) => spatialReplacementPreservesScope(lookup(id)?.spatial, spatial));
}
type ScopeDefinitions = {
  [K in Command["type"]]?: (
    command: Extract<Command, { type: K }>,
    pageId: string,
    scope: LocalMutationScope,
    lookup: LayerLookup,
  ) => boolean;
};
function pageScope(scope: LocalMutationScope, id: string): LocalPageMutationScope {
  let page = scope.pages.get(id);
  if (!page) {
    page = { metadata: false, layers: new Set() };
    scope.pages.set(id, page);
  }
  return page;
}
/** Opt-ins are proofs about handler mutation, not a claim that all commands are local. */
const definitions: ScopeDefinitions = Object.freeze({
  renameProject: () => true,
  updatePage: (command, pageId, scope) => {
    if (!hasOnlyFields(command.patch, pageFields)) return false;
    pageScope(scope, command.targetId ?? pageId).metadata = true;
    return true;
  },
  updateLayers: (command, pageId, scope, lookup) => {
    if (!Array.isArray(command.ids) || !localLayerPatch(command.patch, command.ids, lookup))
      return false;
    const page = pageScope(scope, pageId);
    for (const id of command.ids) page.layers.add(id);
    return true;
  },
  updateLayerPatches: (command, pageId, scope, lookup) => {
    if (!Array.isArray(command.patches)) return false;
    const page = pageScope(scope, pageId);
    for (const item of command.patches) {
      if (!item || !localLayerPatch(item.patch, [item.id], lookup)) return false;
      page.layers.add(item.id);
    }
    return true;
  },
});
export function commandMutationScope(
  project: Project,
  pageId: string,
  commands: readonly Command[],
): CommandMutationScope {
  const scope: LocalMutationScope = { kind: "local", pages: new Map() };
  if (!commands.length || !Object.isFrozen(project)) return { kind: "full" };
  // Spatial capability checks share one active-page index for the entire batch.
  // Scalar-only plans never read the layer graph while deriving their scopes.
  let layers: Map<string, Layer> | undefined;
  const lookup: LayerLookup = (id) => {
    layers ??= new Map(
      project.pages.find((page) => page.id === pageId)?.layers.map((layer) => [layer.id, layer]),
    );
    return layers.get(id);
  };
  for (const command of commands) {
    const define =
      command && Object.hasOwn(definitions, command.type)
        ? (definitions[command.type] as (
            command: Command,
            pageId: string,
            scope: LocalMutationScope,
            lookup: LayerLookup,
          ) => boolean)
        : undefined;
    if (!define?.(command, pageId, scope, lookup)) return { kind: "full" };
  }
  return scope;
}
