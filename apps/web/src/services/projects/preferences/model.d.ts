export type WorkspaceMode = "classic" | "studio";

export interface ProjectLayoutPreferences {
  /** Project-local editor presentation; never part of the portable document. */
  workspaceMode?: WorkspaceMode;
  studioCatalogOpen?: Record<string, boolean>;
  studioCapture?: {
    preset: string;
    width: number;
    height: number;
    full: boolean;
    visible: boolean;
  };
  workspaceLayout?: { workspace: number; inspector: number };
  sidebarLayout?: { properties: number; layers: number };
  /** Requested height as a fraction of the browser viewport, before responsive clamping. */
  timelineHeight?: number;
  /** CSS pixels per second, shared by this project's compositions. */
  timelineZoom?: number;
}

export interface ProjectPreferencesPort {
  read(projectId: string): Promise<ProjectLayoutPreferences>;
  update(projectId: string, patch: ProjectLayoutPreferences): Promise<void>;
}
