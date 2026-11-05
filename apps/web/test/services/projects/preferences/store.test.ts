import { afterEach, expect, test } from "vitest";
import { openStudioDatabase } from "../../../../src/services/projects/database";
import { ProjectPreferencesStore } from "../../../../src/services/projects/preferences/store";
import { projectPreferencesKey } from "../../../../src/services/projects/preferences/schema";
import { retireProject } from "../../../../src/services/projects/lifecycle";

const connections: Awaited<ReturnType<typeof openStudioDatabase>>[] = [];
afterEach(() => {
  for (const db of connections.splice(0)) db.close();
});
async function fixture() {
  const db = await openStudioDatabase(crypto.randomUUID());
  connections.push(db);
  return { db, store: new ProjectPreferencesStore(() => Promise.resolve(db)) };
}

test("restores per-project values and atomically merges concurrent independent fields", async () => {
  const { db, store } = await fixture();
  expect(await store.read("first")).toEqual({});
  await Promise.all([
    store.update("first", { timelineZoom: 260 }),
    store.update("first", { workspaceMode: "studio" }),
    store.update("first", { sidebarLayout: { properties: 55, layers: 45 } }),
  ]);
  const reopened = new ProjectPreferencesStore(() => Promise.resolve(db));
  expect(await reopened.read("first")).toEqual({
    timelineZoom: 260,
    workspaceMode: "studio",
    sidebarLayout: { properties: 55, layers: 45 },
  });
  expect(await reopened.read("second")).toEqual({});
  expect(await db.count("projects")).toBe(0);
  expect(await db.count("assets")).toBe(0);
  expect(await db.count("journalEvents")).toBe(0);
});

test("workspace switches restore legacy v1 values and preserve another client's extra fields", async () => {
  const { db, store } = await fixture();
  const key = projectPreferencesKey("shared-version");
  const legacy = {
    workspaceMode: "studio" as const,
    studioCatalogOpen: { "material:metal": false },
    studioCapture: { preset: "custom", width: 1080, height: 1920, full: false, visible: true },
    workspaceLayout: { workspace: 75, inspector: 25 },
    sidebarLayout: { properties: 60, layers: 40 },
    timelineHeight: 0.35,
    timelineZoom: 240,
  };
  const futurePanel = { expanded: true, width: 320 };
  await db.put(
    "preferences",
    JSON.stringify({ version: 1, values: { ...legacy, futurePanel } }),
    key,
  );
  expect(await store.read("shared-version")).toEqual(legacy);
  for (const mode of ["classic", "studio", "classic"] as const) {
    await Promise.all([
      store.update("shared-version", { workspaceMode: mode }),
      store.update("shared-version", { timelineZoom: 360 }),
    ]);
    const reopened = new ProjectPreferencesStore(() => Promise.resolve(db));
    expect(await reopened.read("shared-version")).toEqual({
      ...legacy,
      workspaceMode: mode,
      timelineZoom: 360,
    });
    expect(JSON.parse((await db.get("preferences", key))!)).toEqual({
      version: 1,
      values: { ...legacy, futurePanel, workspaceMode: mode, timelineZoom: 360 },
    });
  }
  const before = await db.get("preferences", key);
  const unknownPatch = { ...legacy, futurePanel };
  await expect(store.update("shared-version", unknownPatch)).rejects.toMatchObject({
    code: "PROJECT_PREFERENCES_SAVE_FAILED",
  });
  expect(await db.get("preferences", key)).toBe(before);
});

test("extra persisted fields do not conceal invalid known values or permit replacement writes", async () => {
  const { db, store } = await fixture();
  const key = projectPreferencesKey("invalid-known");
  const raw = JSON.stringify({
    version: 1,
    values: { workspaceMode: "studio", timelineZoom: 0, futurePanel: true },
  });
  await db.put("preferences", raw, key);
  await expect(store.read("invalid-known")).rejects.toMatchObject({
    code: "PROJECT_PREFERENCES_LOAD_FAILED",
    cause: { message: "Invalid timeline zoom preference." },
  });
  await expect(store.update("invalid-known", { workspaceMode: "classic" })).rejects.toMatchObject({
    code: "PROJECT_PREFERENCES_SAVE_FAILED",
    cause: { message: "Invalid timeline zoom preference." },
  });
  expect(await db.get("preferences", key)).toBe(raw);
});

test("retirement rejects queued writes and cannot recreate the removed preference", async () => {
  const { db, store } = await fixture();
  await store.update("retired", { timelineZoom: 320, workspaceMode: "studio" });
  const tx = db.transaction("preferences", "readwrite");
  await retireProject(tx.store, "retired");
  await tx.store.delete(projectPreferencesKey("retired"));
  await tx.done;
  await expect(store.update("retired", { workspaceMode: "classic" })).rejects.toMatchObject({
    code: "PROJECT_PREFERENCES_SAVE_FAILED",
    cause: { code: "PROJECT_DELETED" },
  });
  await expect(store.read("retired")).rejects.toMatchObject({
    code: "PROJECT_PREFERENCES_LOAD_FAILED",
  });
  expect(await db.get("preferences", projectPreferencesKey("retired"))).toBeUndefined();
});

test("reports real corruption, invalid values and unavailable storage without replacing saved data", async () => {
  const { db, store } = await fixture();
  await db.put("preferences", "corrupt", projectPreferencesKey("broken"));
  await expect(store.read("broken")).rejects.toMatchObject({
    code: "PROJECT_PREFERENCES_LOAD_FAILED",
    cause: expect.any(SyntaxError),
  });
  await expect(store.update("broken", { timelineZoom: 300 })).rejects.toMatchObject({
    code: "PROJECT_PREFERENCES_SAVE_FAILED",
  });
  expect(await db.get("preferences", projectPreferencesKey("broken"))).toBe("corrupt");
  await expect(store.update("other", { timelineZoom: Infinity })).rejects.toMatchObject({
    code: "PROJECT_PREFERENCES_SAVE_FAILED",
  });
  const failure = new Error("storage denied");
  const unavailable = new ProjectPreferencesStore(() => Promise.reject(failure));
  await expect(unavailable.read("first")).rejects.toMatchObject({ cause: failure });
  await expect(unavailable.update("first", { timelineHeight: 0.3 })).rejects.toMatchObject({
    cause: failure,
  });
});
