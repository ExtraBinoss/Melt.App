import { expect, test, type Page } from "@playwright/test";

async function ready(page: Page) {
  await page.waitForFunction(() => Boolean(window.musart));
  await expect(page.locator('canvas[data-renderer-ready="true"]')).toBeVisible();
}

test("real persisted projects restore undo, redo cursors and branches across browser reloads", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem("musart.editor-tutorial.v1", "done");
    localStorage.setItem("musart.language", "en");
    localStorage.setItem("musart.onboarding.v1", JSON.stringify({ version: 1, completed: true }));
  });
  await page.goto("/editor?automation=1");
  await ready(page);
  const original = await page.evaluate(async () => {
    const api = window.musart!;
    const project = api.snapshot().project;
    api.execute({ type: "renameProject", name: "Persisted first edit" });
    api.execute({ type: "renameProject", name: "Persisted second edit" });
    api.undo();
    await api.save();
    await api.flush();
    const request = indexedDB.open("musart-studio");
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      const tx = db.transaction(["projects", "journalEvents"]);
      const saved = tx.objectStore("projects").get(project.id);
      const entries = tx
        .objectStore("journalEvents")
        .count(IDBKeyRange.bound([project.id, 0], [project.id, Number.MAX_SAFE_INTEGER]));
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onabort = () => reject(tx.error);
      });
      if (saved.result?.project.name !== "Persisted first edit" || entries.result < 3)
        throw new Error("The actual project and journal did not persist before reload.");
    } finally {
      db.close();
    }
    return { id: project.id, name: project.name };
  });
  // No fixture loader runs after this navigation: bootstrap must read the actual saved record.
  await page.reload();
  await ready(page);
  expect(await page.evaluate(() => window.musart!.session())).toMatchObject({
    projectId: original.id,
    canUndo: true,
    canRedo: true,
  });
  await page.getByTestId("editor-canvas").focus();
  await page.keyboard.press("ControlOrMeta+z");
  expect(await page.evaluate(() => window.musart!.snapshot().project.name)).toBe(original.name);
  await page.keyboard.press("ControlOrMeta+Shift+z");
  expect(await page.evaluate(() => window.musart!.snapshot().project.name)).toBe(
    "Persisted first edit",
  );
  await page.keyboard.press("ControlOrMeta+Shift+z");
  expect(await page.evaluate(() => window.musart!.snapshot().project.name)).toBe(
    "Persisted second edit",
  );
  await page.evaluate(async () => {
    const api = window.musart!;
    api.undo();
    api.execute({ type: "renameProject", name: "Persisted new branch" });
    await api.save();
    await api.flush();
  });
  await page.reload();
  await ready(page);
  expect(await page.evaluate(() => window.musart!.session())).toMatchObject({
    projectId: original.id,
    canUndo: true,
    canRedo: false,
  });
  await page.getByTestId("editor-canvas").focus();
  await page.keyboard.press("ControlOrMeta+z");
  expect(await page.evaluate(() => window.musart!.snapshot().project.name)).toBe(
    "Persisted first edit",
  );
  expect(errors).toEqual([]);
});
