import type { WorkspaceMode } from "../../services/projects/preferences/model";

export type WorkspaceNoticePlacement = "top-center" | "bottom-right";

/** All editor feedback shares this policy, including surfaces rendered through portals. */
export function workspaceNoticePlacement(
  mode: WorkspaceMode | undefined,
): WorkspaceNoticePlacement {
  return mode === "studio" ? "bottom-right" : "top-center";
}
