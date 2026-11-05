import type { HistoryDescription, HistoryOwner, Layer, SessionSnapshot } from "@musart/core";

export type HistoryOwnerNames = readonly (string | undefined)[];

/** Read only the exact committed endpoints; deleted and inactive objects remain identifiable. */
export function historyOwnerNames(
  description: HistoryDescription,
  before: SessionSnapshot,
  after: SessionSnapshot,
): HistoryOwnerNames {
  const indexes = new Map<object, ReadonlyMap<string, Layer>>();
  const name = (owner: HistoryOwner, snapshot: SessionSnapshot): string | undefined => {
    if (owner.kind === "project" || owner.kind === "asset") return snapshot.project.name;
    const page = snapshot.project.pages.find((page) => page.id === owner.compositionId);
    if (!page) return;
    if (owner.kind === "composition") return page.name;
    if (owner.kind === "layer" || owner.kind === "mask" || owner.kind === "effect") {
      if (owner.kind === "effect" && !owner.layerId) return page.name;
      let layers = indexes.get(page);
      if (!layers) {
        layers = new Map(page.layers.map((layer) => [layer.id, layer]));
        indexes.set(page, layers);
      }
      return layers.get(owner.layerId!)?.name;
    }
    if (owner.kind === "audio")
      return page.motion?.audioTracks?.find((track) => track.id === owner.trackId)?.name;
    return;
  };
  return Object.freeze(
    description.changes.map((change) => {
      const owner = change.kind === "property" ? change.target.owner : change.owner,
        value = name(owner, after) || name(owner, before);
      if (!value) return;
      let bounded = "",
        count = 0;
      for (const character of value) {
        if (count++ === 120) return `${bounded}…`;
        bounded += character;
      }
      return bounded;
    }),
  );
}
