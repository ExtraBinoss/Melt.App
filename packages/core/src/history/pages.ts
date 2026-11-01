import type { HistoryHandlers, HistoryContext } from "./collector";
import { watchFields } from "./collector";
import { captureScene } from "./scene";
import type { CompositionHistoryProperty } from "./model";
const fields: readonly CompositionHistoryProperty[] = [
  "name",
  "width",
  "height",
  "background",
  "rulers",
  "colorSpace",
  "margins.top",
  "margins.right",
  "margins.bottom",
  "margins.left",
  "canvasPosition.x",
  "canvasPosition.y",
];
export const updatePage: HistoryHandlers["updatePage"] = (context, command) => {
  const page = context.project.pages.find(
    (page) => page.id === (command.targetId ?? context.page.id),
  );
  if (!page) return;
  const owner = { kind: "composition", compositionId: page.id } as const;
  watchFields(
    context,
    owner,
    fields.filter((key) => Object.hasOwn(command.patch, key.split(".")[0]!)),
    () => page,
    { ...page, ...command.patch },
  );
  if (Object.hasOwn(command.patch, "backgroundGradient")) {
    const count = Math.max(
      page.backgroundGradient?.stops.length ?? 0,
      command.patch.backgroundGradient?.stops.length ?? 0,
    );
    const paintFields: CompositionHistoryProperty[] = [
      "backgroundGradient.kind",
      "backgroundGradient.angle",
    ];
    for (let i = 0; i < count; i++)
      paintFields.push(
        `backgroundGradient.stops.${i}.color`,
        `backgroundGradient.stops.${i}.offset`,
      );
    watchFields(context, owner, paintFields, () => page, { ...page, ...command.patch });
  }
  if (Object.hasOwn(command.patch, "spatial"))
    captureScene({ ...context, page }, () => page.spatial, command.patch.spatial);
  if (Object.hasOwn(command.patch, "guides"))
    captureGuides({ ...context, page }, command.patch.guides ?? []);
};
function captureGuides(
  context: HistoryContext,
  proposed: readonly import("../document/model").Guide[],
): void {
  const old = new Map(context.page.guides.map((guide) => [guide.id, guide]));
  const next = new Map(proposed.map((guide) => [guide.id, guide]));
  for (const [guideId, guide] of old) {
    const owner = { kind: "guide", compositionId: context.page.id, guideId } as const;
    if (!next.has(guideId)) context.history.action("delete", owner);
    else
      watchFields(
        context,
        owner,
        ["axis", "position", "color"],
        () => context.page.guides.find((item) => item.id === guideId) ?? guide,
        next.get(guideId),
      );
  }
  for (const guide of proposed)
    if (!old.has(guide.id))
      context.history.action("add", {
        kind: "guide",
        compositionId: context.page.id,
        guideId: guide.id,
      });
}
export const renameProject: HistoryHandlers["renameProject"] = (context, command) => {
  watchFields(
    context,
    { kind: "project", projectId: context.project.id },
    ["name"],
    () => context.project,
    { name: command.name },
  );
};
export const updateGuide: HistoryHandlers["updateGuide"] = (context, command) => {
  const page = context.page;
  const guide = (
    command.targetId ? context.layers().get(command.targetId)?.guides : page.guides
  )?.find((guide) => guide.id === command.id);
  if (guide)
    watchFields(
      context,
      { kind: "guide", compositionId: page.id, guideId: guide.id },
      Object.keys(command.patch),
      () => guide,
      { ...guide, ...command.patch },
    );
};
export const updateMask: HistoryHandlers["updateMask"] = (context, command) => {
  const layer = context.layers().get(command.targetId);
  if (layer)
    watchFields(
      context,
      { kind: "mask", compositionId: context.page.id, layerId: layer.id },
      Object.keys(command.patch),
      () => layer.mask,
      { ...layer.mask, ...command.patch },
    );
};
