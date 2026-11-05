import { createContext, useContext } from "react";
import type { WorkspaceMode } from "../../services/projects/preferences/model";

/** React context crosses portals without changing page or body styles. */
export const WorkspaceTheme = createContext<WorkspaceMode | undefined>(undefined);

/** Apply to the actual portaled surface so its controls inherit the same radius tokens. */
export function useWorkspaceTheme() {
  return useContext(WorkspaceTheme);
}
