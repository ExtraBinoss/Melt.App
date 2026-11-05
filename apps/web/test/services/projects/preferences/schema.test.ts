import { expect, test } from "vitest";
import {
  parseProjectPreferences,
  projectPreferencesKey,
  validateProjectPreferences,
} from "../../../../src/services/projects/preferences/schema";

test("validates the small versioned record without admitting document fields", () => {
  const values = {
    workspaceMode: "studio" as const,
    workspaceLayout: { workspace: 75, inspector: 25 },
    sidebarLayout: { properties: 60, layers: 40 },
    timelineZoom: 320,
    timelineHeight: 0.4,
  };
  expect(parseProjectPreferences(JSON.stringify({ version: 1, values }))).toEqual(values);
  expect(validateProjectPreferences(values)).not.toBe(values);
  expect(parseProjectPreferences(undefined)).toEqual({});
  expect(projectPreferencesKey("a:b")).not.toBe(projectPreferencesKey("a"));
  for (const value of [
    null,
    [],
    { assets: {} },
    { workspaceMode: "3d" },
    { workspaceMode: true },
    { workspaceMode: null },
    { timelineZoom: NaN },
    { timelineZoom: 641 },
    { timelineHeight: 0 },
    { workspaceLayout: { workspace: 60, inspector: 20 } },
    { sidebarLayout: { properties: 60, layers: 40, extra: 0 } },
  ])
    expect(() => validateProjectPreferences(value)).toThrow();
  for (const raw of [
    "bad-json",
    JSON.stringify({ version: 2, values }),
    JSON.stringify({ version: 1, values: [] }),
  ])
    expect(() => parseProjectPreferences(raw)).toThrow();
});

test("legacy layout records stay compatible and both presentation modes are explicit", () => {
  expect(
    parseProjectPreferences(JSON.stringify({ version: 1, values: { timelineZoom: 240 } })),
  ).toEqual({ timelineZoom: 240 });
  expect(validateProjectPreferences({ workspaceMode: "classic" })).toEqual({
    workspaceMode: "classic",
  });
  expect(validateProjectPreferences({ workspaceMode: "studio" })).toEqual({
    workspaceMode: "studio",
  });
});

test("Studio stores bounded category choices and validated capture formats independently of documents", () => {
  const studioCapture = { preset: "custom", width: 1080, height: 1920, full: false, visible: true };
  const studioCatalogOpen = { "material:plastic": false, "environment:studio": true };
  const input = { studioCapture, studioCatalogOpen };
  const parsed = validateProjectPreferences(input);
  expect(parsed).toEqual(input);
  expect(parsed.studioCapture).not.toBe(studioCapture);
  expect(parsed.studioCatalogOpen).not.toBe(studioCatalogOpen);
  for (const invalid of [
    { studioCapture: { ...studioCapture, width: 0 } },
    { studioCapture: { ...studioCapture, height: 1.5 } },
    { studioCapture: { ...studioCapture, height: 16385 } },
    { studioCapture: { ...studioCapture, region: { x: 0 } } },
    { studioCatalogOpen: { "material:plastic": 1 } },
    { studioCatalogOpen: { "script:arbitrary": false } },
  ])
    expect(() => validateProjectPreferences(invalid)).toThrow();
});
