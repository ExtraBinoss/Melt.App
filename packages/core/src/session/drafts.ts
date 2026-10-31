import type { Command, Project } from "../document/model";
import { cloneValue } from "../document/immutable";
import { createLayerPatchDraft } from "../layers/draft";
import { commandMutationScope, type CommandMutationScope } from "./scopes";
type DraftFactories = {
  [K in Command["type"]]?: (
    project: Project,
    pageId: string,
    command: Extract<Command, { type: K }>,
  ) => Project;
};
/** Opt in only handlers whose mutation contract is safe on the declared shallow draft. */
const factories: DraftFactories = Object.freeze({
  addPage: (project) => ({ ...project, pages: [...project.pages] }),
  deletePage: (project) => ({ ...project, pages: [...project.pages] }),
  updateMotionAudioTrack: (project, pageId, command) => ({
    ...project,
    pages: project.pages.map((page) =>
      page.id !== pageId || !page.motion
        ? page
        : {
            ...page,
            motion: {
              ...page.motion,
              ...(page.motion.audioTracks
                ? {
                    audioTracks: page.motion.audioTracks.map((track) =>
                      track.id === command.trackId ? { ...track } : track,
                    ),
                  }
                : {}),
            },
          },
    ),
  }),
  updatePage: (project, pageId, command) => ({
    ...project,
    // updatePage assigns permitted top-level metadata; it never mutates layer/asset data.
    pages: project.pages.map((page) =>
      page.id === (command.targetId ?? pageId) ? { ...page } : page,
    ),
  }),
  updateLayers: (project, pageId, command) =>
    createLayerPatchDraft(
      project,
      pageId,
      command.patch.mask === null ? undefined : new Set(command.ids),
    ),
  updateLayerPatches: (project, pageId, command) =>
    createLayerPatchDraft(
      project,
      pageId,
      command.patches.some(({ patch }) => patch.mask === null)
        ? undefined
        : new Set(command.patches.map(({ id }) => id)),
    ),
});
export function createCommandDraft(
  project: Project,
  pageId: string,
  commands: readonly Command[],
  scope: CommandMutationScope = commandMutationScope(project, pageId, commands),
): Project {
  if (scope.kind === "local") {
    return {
      ...project,
      pages: scope.pages.size
        ? project.pages.map((page) => {
            const touched = scope.pages.get(page.id);
            return touched
              ? {
                  ...page,
                  ...(touched.layers.size
                    ? {
                        layers: page.layers.map((layer) =>
                          touched.layers.has(layer.id) ? { ...layer } : layer,
                        ),
                      }
                    : {}),
                }
              : page;
          })
        : project.pages,
    };
  }
  const command = commands.length === 1 ? commands[0] : undefined;
  // Dispatch retains the command/factory correlation checked by DraftFactories.
  const factory = (
    command && Object.hasOwn(factories, command.type) ? factories[command.type] : undefined
  ) as ((project: Project, pageId: string, command: Command) => Project) | undefined;
  return factory && command && Object.isFrozen(project)
    ? factory(project, pageId, command)
    : cloneValue(project);
}
