import { createContext } from "react";
import type { WorkspaceMode } from "../../../services/projects/preferences/model";

/** Presentation can trail a choice while the outgoing chrome leaves. */
export const PresentedWorkspaceMode = createContext<WorkspaceMode | null>(null);
export const WorkspaceChromeReadiness = createContext<(() => () => void) | null>(null);
