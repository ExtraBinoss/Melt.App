import { selectedRoots } from "../layers/access";
import type { Command } from "../document/model";
import type { HistoryContext, HistoryHandlers, HistoryCapture } from "./collector";
import { layerOwner, motionOwner } from "./collector";
import * as layers from "./layers";
import * as pages from "./pages";
import * as motion from "./motion";
import * as audio from "./audio";

/** Exhaustive domain dispatch: implementations stay beside the relevant property collectors. */
export const HISTORY_HANDLERS: HistoryHandlers = {
  setDocumentColors: (context) => {
    context.history.action("geometry", { kind: "project", projectId: context.project.id });
  },
  deleteDocumentColor: (context) => {
    context.history.action("delete", { kind: "project", projectId: context.project.id });
  },
  linkDocumentColor: (context) => {
    context.history.action("geometry", { kind: "project", projectId: context.project.id });
  },
  applyBackgroundPreset: (context) => {
    context.history.action("geometry", { kind: "composition", compositionId: context.page.id });
  },
  updateLayers: layers.updateLayers,
  updateLayerPatches: layers.updateLayerPatches,
  alignLayers: layers.alignLayers,
  distributeLayers: layers.distributeLayers,
  addLayers: (context, command) => {
    for (const layer of command.layers)
      context.history.action("add", layerOwner(context.page, layer.id));
  },
  deleteLayers: (context, command) => {
    for (const id of command.ids) context.history.action("delete", layerOwner(context.page, id));
  },
  duplicateLayers: (context, command) => {
    for (const id of command.ids) context.history.action("duplicate", layerOwner(context.page, id));
  },
  shiftLayers: (context, command) => {
    for (const id of command.ids) context.history.action("reorder", layerOwner(context.page, id));
  },
  toggleClipping: (context, command) => {
    const roots = selectedRoots(context.page, command.ids),
      action = roots.every((layer) => layer.clipping) ? "delete" : "add";
    for (const layer of roots)
      context.history.action(action, {
        kind: "mask",
        compositionId: context.page.id,
        layerId: layer.id,
      });
  },
  reorderLayer: (context, command) => {
    context.history.action("reorder", layerOwner(context.page, command.id));
  },
  groupLayers: (context, command) => {
    for (const id of command.ids) context.history.action("group", layerOwner(context.page, id));
  },
  ungroupLayers: (context, command) => {
    for (const id of command.ids) context.history.action("ungroup", layerOwner(context.page, id));
  },
  addPage: (context, command) => () => {
    context.history.action("add", {
      kind: "composition",
      compositionId: command.page?.id ?? context.project.pages.at(-1)!.id,
    });
  },
  updatePage: pages.updatePage,
  deletePage: (context, command) => {
    context.history.action("delete", { kind: "composition", compositionId: command.id });
  },
  renameProject: pages.renameProject,
  addAssets: (context) => {
    context.history.action("assets", { kind: "asset", projectId: context.project.id });
  },
  setReplay: (context) => {
    context.history.action("replay", { kind: "project", projectId: context.project.id });
  },
  addGuide: (context, command) => {
    context.history.action("add", {
      kind: "guide",
      compositionId: context.page.id,
      guideId: command.guide.id,
    });
  },
  updateGuide: pages.updateGuide,
  deleteGuide: (context, command) => {
    context.history.action("delete", {
      kind: "guide",
      compositionId: context.page.id,
      guideId: command.id,
    });
  },
  attachLayerMask: (context, command) => {
    context.history.action("add", {
      kind: "mask",
      compositionId: context.page.id,
      layerId: command.targetId,
    });
  },
  createMaskFromSelection: (context, command) => {
    context.history.action("add", {
      kind: "mask",
      compositionId: context.page.id,
      layerId: command.targetId ?? command.ids.at(-1)!,
    });
  },
  updateMask: pages.updateMask,
  removeLayerMask: (context, command) => {
    context.history.action("delete", {
      kind: "mask",
      compositionId: context.page.id,
      layerId: command.targetId,
    });
  },
  setCompositionMode: motion.setCompositionMode,
  setMotionDuration: motion.setMotionDuration,
  addMotionOccurrence: (context) => () => {
    context.history.action(
      "add",
      motionOwner(context.page, "occurrence", { trackId: context.page.motion?.tracks.at(-1)?.id }),
    );
  },
  duplicateMotionOccurrence: (context, command) => {
    context.history.action(
      "duplicate",
      motionOwner(context.page, "occurrence", { trackId: command.trackId }),
    );
  },
  deleteMotionOccurrence: (context, command) => {
    context.history.action(
      "delete",
      motionOwner(context.page, "occurrence", { trackId: command.trackId }),
    );
  },
  setMotionTrackRange: motion.setMotionTrackRange,
  setMotionMedia: motion.setMotionMedia,
  moveMotionTrack: motion.moveMotionTrack,
  upsertMotionKeyframe: motion.upsertMotionKeyframe,
  moveMotionKeyframe: motion.moveMotionKeyframe,
  deleteMotionKeyframe: motion.deleteMotionKeyframe,
  moveMotionKeyframes: motion.moveMotionKeyframes,
  deleteMotionKeyframes: motion.deleteMotionKeyframes,
  addMotionAudioTrack: (context, command) => {
    context.history.action("add", {
      kind: "audio",
      compositionId: context.page.id,
      trackId: command.track.id,
    });
  },
  updateMotionAudioTrack: audio.updateMotionAudioTrack,
  moveMotionAudioTrack: audio.moveMotionAudioTrack,
  setMotionAudioTrackRange: audio.setMotionAudioTrackRange,
  deleteMotionAudioTrack: (context, command) => {
    context.history.action("delete", {
      kind: "audio",
      compositionId: context.page.id,
      trackId: command.trackId,
    });
  },
  addMotionAnimation: motion.addMotionAnimation,
  updateMotionAnimation: motion.updateMotionAnimation,
  deleteMotionAnimation: (context, command) => {
    context.history.action(
      "delete",
      motionOwner(context.page, "animation", { animationId: command.animationId }),
    );
  },
  applyMotionTransition: (context, command) => {
    context.history.action(
      "applyTransition",
      motionOwner(context.page, "transition", { trackId: command.trackId }),
    );
  },
};
export function captureHistoryCommand(context: HistoryContext, command: Command): HistoryCapture {
  // Unknown names belong to applyCommand's authoritative validation/error contract.
  if (!Object.hasOwn(HISTORY_HANDLERS, command.type)) return;
  const capture = HISTORY_HANDLERS[command.type] as (
    context: HistoryContext,
    command: Command,
  ) => HistoryCapture;
  return capture(context, command);
}
