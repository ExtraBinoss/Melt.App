import type { Project } from "@musart/core";
/** Replay originals can outlive their final-state layer; retain each owning inventory. */
export function portableAssets(project: Project) {
  return [
    project.assets,
    ...(project.replay ? [project.replay.initial.assets, project.replay.assets] : []),
  ];
}
