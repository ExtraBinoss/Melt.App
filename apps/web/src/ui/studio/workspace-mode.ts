import { useCallback, useSyncExternalStore } from "react";
import { useProjectPreferences } from "../../components/workspace/preferences/context";
import type { ProjectPreferencesController } from "../../components/workspace/preferences/controller";
import type { WorkspaceMode } from "../../services/projects/preferences/model";

export type { WorkspaceMode } from "../../services/projects/preferences/model";

const initialOverrides = new WeakMap<ProjectPreferencesController, WorkspaceMode | null>();

/** Explicit automation/preview presentation, never a portable document or saved preference. */
export function workspaceModeFromSearch(search: string): WorkspaceMode | null {
  const value = new URLSearchParams(search).get("workspace");
  return value === "classic" || value === "studio" ? value : null;
}

function initialOverride(preferences: ProjectPreferencesController | null): WorkspaceMode | null {
  if (!preferences) return null;
  if (!initialOverrides.has(preferences))
    initialOverrides.set(
      preferences,
      typeof window === "undefined" ? null : workspaceModeFromSearch(window.location.search),
    );
  return initialOverrides.get(preferences) ?? null;
}

/** A project-local presentation choice; legacy projects retain the Classic workspace. */
export function useWorkspaceMode(): WorkspaceMode {
  const preferences = useProjectPreferences();
  const subscribe = useCallback(
    (notify: () => void) => preferences?.subscribe("workspaceMode", notify) ?? (() => {}),
    [preferences],
  );
  const read = useCallback(
    () => initialOverride(preferences) ?? preferences?.read("workspaceMode") ?? "classic",
    [preferences],
  );
  return useSyncExternalStore(subscribe, read, read);
}

/** User choices replace the initial override and use the guarded preference storage path. */
export function useSetWorkspaceMode() {
  const preferences = useProjectPreferences();
  return useCallback(
    (mode: WorkspaceMode) => {
      if (!preferences) return;
      initialOverrides.set(preferences, null);
      preferences.commit("workspaceMode", mode);
    },
    [preferences],
  );
}
