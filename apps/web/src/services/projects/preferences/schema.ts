import type { ProjectLayoutPreferences } from "./model";

export const projectPreferencesKey = (projectId: string) =>
  JSON.stringify(["musart:project-layout", projectId]);

export const preferenceFields = [
  "workspaceMode",
  "studioCatalogOpen",
  "studioCapture",
  "workspaceLayout",
  "sidebarLayout",
  "timelineHeight",
  "timelineZoom",
] as const;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finite(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}

/** Only small presentation fields are accepted; documents and assets cannot enter it. */
export function validateProjectPreferences(value: unknown): ProjectLayoutPreferences {
  if (
    !record(value) ||
    Object.keys(value).some((key) => !preferenceFields.some((field) => field === key))
  )
    throw new Error("Invalid project layout preferences.");
  const result: ProjectLayoutPreferences = {};
  if (value.studioCatalogOpen !== undefined) {
    const open = value.studioCatalogOpen;
    if (
      !record(open) ||
      Object.keys(open).length > 32 ||
      Object.entries(open).some(
        ([key, active]) =>
          !/^(material|environment):[a-z-]{1,32}$/.test(key) || typeof active !== "boolean",
      )
    )
      throw new Error("Invalid Studio category preferences.");
    result.studioCatalogOpen = { ...open } as Record<string, boolean>;
  }
  if (value.studioCapture !== undefined) {
    const frame = value.studioCapture;
    if (
      !record(frame) ||
      Object.keys(frame).length !== 5 ||
      typeof frame.preset !== "string" ||
      frame.preset.length > 100 ||
      !finite(frame.width, 1, 16384) ||
      !finite(frame.height, 1, 16384) ||
      !Number.isInteger(frame.width) ||
      !Number.isInteger(frame.height) ||
      typeof frame.full !== "boolean" ||
      typeof frame.visible !== "boolean"
    )
      throw new Error("Invalid Studio capture preference.");
    result.studioCapture = {
      preset: frame.preset,
      width: frame.width,
      height: frame.height,
      full: frame.full,
      visible: frame.visible,
    };
  }
  if (value.workspaceMode !== undefined) {
    if (value.workspaceMode !== "classic" && value.workspaceMode !== "studio")
      throw new Error("Invalid workspace mode preference.");
    result.workspaceMode = value.workspaceMode;
  }
  for (const [field, first, second] of [
    ["workspaceLayout", "workspace", "inspector"],
    ["sidebarLayout", "properties", "layers"],
  ] as const) {
    const layout = value[field];
    if (layout === undefined) continue;
    if (
      !record(layout) ||
      Object.keys(layout).length !== 2 ||
      !finite(layout[first], 0, 100) ||
      !finite(layout[second], 0, 100) ||
      Math.abs(layout[first] + layout[second] - 100) > 0.01
    )
      throw new Error(`Invalid ${field} project preference.`);
    if (field === "workspaceLayout")
      result.workspaceLayout = { workspace: layout[first], inspector: layout[second] };
    else result.sidebarLayout = { properties: layout[first], layers: layout[second] };
  }
  if (value.timelineHeight !== undefined) {
    if (!finite(value.timelineHeight, 0.01, 1))
      throw new Error("Invalid timeline height preference.");
    result.timelineHeight = value.timelineHeight;
  }
  if (value.timelineZoom !== undefined) {
    if (!finite(value.timelineZoom, 20, 640)) throw new Error("Invalid timeline zoom preference.");
    result.timelineZoom = value.timelineZoom;
  }
  return result;
}

export function parseProjectPreferences(raw: string | undefined): ProjectLayoutPreferences {
  if (raw === undefined) return {};
  const stored: unknown = JSON.parse(raw);
  if (!record(stored) || stored.version !== 1 || !record(stored.values))
    throw new Error("Unsupported project layout preferences.");
  return validateProjectPreferences(stored.values);
}
