import { expect, test, type Page } from "@playwright/test";
import { createLayer, createPage, createProject } from "@musart/core";

async function preferences(page: Page, projectId: string, values?: Record<string, unknown>) {
  return page.evaluate(
    async ({ id, values }) => {
      return new Promise<Record<string, unknown>>((resolve, reject) => {
        const opening = indexedDB.open("musart-studio");
        opening.onerror = () => reject(opening.error);
        opening.onsuccess = () => {
          const database = opening.result;
          const transaction = database.transaction(
            "preferences",
            values ? "readwrite" : "readonly",
          );
          const store = transaction.objectStore("preferences");
          const key = JSON.stringify(["musart:project-layout", id]);
          if (values) store.put(JSON.stringify({ version: 1, values }), key);
          const request = store.get(key);
          let result: Record<string, unknown> = {};
          request.onsuccess = () => {
            result = JSON.parse(request.result).values;
          };
          transaction.oncomplete = () => {
            database.close();
            resolve(result);
          };
          transaction.onabort = () => {
            database.close();
            reject(transaction.error);
          };
        };
      });
    },
    { id: projectId, values },
  );
}

async function choose(page: Page, mode: "Classic" | "Studio") {
  const trigger = page.getByRole("button", { name: "Project actions", exact: true });
  await trigger.click();
  await page.getByRole("combobox", { name: "Workspace", exact: true }).click();
  await page.getByRole("option", { name: mode, exact: true }).click();
  await expect(page.locator(".workspace-mode-root")).toHaveAttribute(
    "data-workspace-mode",
    mode.toLowerCase(),
  );
  await expect(page.locator(".workspace-mode-root")).toHaveAttribute(
    "data-workspace-transition",
    "idle",
  );
  await trigger.click();
}

test("workspace switches preserve extended v1 preferences and Studio Shift keeps the renderer free of native focus borders", async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.routeWebSocket("**", () => {});
  await page.addInitScript(() => {
    localStorage.setItem("musart.language", "en");
    localStorage.setItem("musart.editor-tutorial.v1", "done");
  });
  await page.goto("/editor?automation=1");
  await page.waitForFunction(() => !!window.musart);
  const project = createProject({
    name: "Workspace preferences compatibility",
    pages: [createPage({ width: 640, height: 480, layers: [createLayer("rectangle")] })],
  });
  await page.evaluate(async (value) => {
    window.musart!.load(value);
    await window.musart!.save();
  }, project);
  // An additive field from another running version must survive older clients.
  const extra = { version: 2, enabled: true };
  await preferences(page, project.id, {
    workspaceMode: "classic",
    timelineZoom: 180,
    workspaceLayout: { workspace: 73, inspector: 27 },
    sidebarLayout: { properties: 70, layers: 30 },
    futureStudioPreference: extra,
  });
  await page.reload();
  await page.waitForFunction((id) => window.musart?.snapshot().project.id === id, project.id);
  const canvas = page.locator(".editor-gpu-scene canvas");
  await expect(canvas).toHaveAttribute("data-renderer-ready", "true", { timeout: 40000 });
  const original = await page.evaluate(() => window.musart!.snapshot().project);
  for (const mode of ["Studio", "Classic", "Studio"] as const) {
    await choose(page, mode);
    await expect
      .poll(async () => (await preferences(page, project.id)).workspaceMode)
      .toBe(mode.toLowerCase());
    await expect(page.getByText(/could not be restored for this project/)).toHaveCount(0);
  }
  await canvas.focus();
  await expect(canvas).toBeFocused();
  await page.keyboard.down("Shift");
  await expect(canvas).toBeFocused();
  await expect(canvas).toHaveCSS("outline-style", "none");
  await page.screenshot({ path: "artifacts/studio/studio-shift-focus.png" });
  await page.keyboard.up("Shift");
  expect(await preferences(page, project.id)).toMatchObject({
    timelineZoom: 180,
    futureStudioPreference: extra,
  });
  expect(await page.evaluate(() => window.musart!.snapshot().project)).toEqual(original);
  await page.reload();
  await page.waitForFunction((id) => window.musart?.snapshot().project.id === id, project.id, {
    timeout: 40000,
  });
  await expect(page.locator(".workspace-mode-root")).toHaveAttribute(
    "data-workspace-mode",
    "studio",
  );
  await expect(canvas).toHaveAttribute("data-renderer-ready", "true", { timeout: 40000 });
  await expect(page.getByText(/could not be restored for this project/)).toHaveCount(0);
});
