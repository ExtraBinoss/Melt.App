import type { CommandCommitInfo } from "@musart/core";

/** Read bounded owner metadata; never infer affected layers from the user's selection. */
export function commitTargetNames(info: CommandCommitInfo): string[] {
  const names = new Set<string>();
  for (const change of info.history?.changes ?? []) {
    const owner = change.kind === "property" ? change.target.owner : change.owner;
    if (!("compositionId" in owner)) continue;
    const page = info.snapshot.project.pages.find((page) => page.id === owner.compositionId);
    const layerId =
      "layerId" in owner
        ? owner.layerId
        : owner.kind === "motion"
          ? page?.motion?.tracks.find((track) => track.id === owner.trackId)?.layerId
          : undefined;
    if (layerId) names.add(page?.layers.find((layer) => layer.id === layerId)?.name ?? layerId);
    if (names.size >= 12) break;
  }
  return [...names];
}
