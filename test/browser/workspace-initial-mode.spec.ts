import { expect, test } from "@playwright/test";
import { createLayer, createPage, createProject } from "@musart/core";

test("saved Studio opens directly under the existing Melt loader without presenting Classic", async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.routeWebSocket("**", () => {});
  await page.addInitScript(() => {
    localStorage.setItem("musart.language", "en");
    localStorage.setItem("musart.editor-tutorial.v1", "done");
    const witness: string[] = [];
    Object.assign(window, { workspacePaintWitness: witness });
    const sample = () => {
      const root = document.querySelector<HTMLElement>(".workspace-mode-root");
      const main = root?.querySelector<HTMLElement>(".musart-app");
      if (main && getComputedStyle(main).visibility === "visible") {
        const mode = root!.dataset.workspaceMode!;
        if (witness.at(-1) !== mode) witness.push(mode);
      }
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  await page.goto("/editor?automation=1&workspace=classic");
  await page.waitForFunction(() => !!window.musart, undefined, { timeout: 40000 });
  const project = createProject({
    name: "Direct Studio opening",
    pages: [createPage({ width: 320, height: 240, layers: [createLayer("rectangle")] })],
  });
  await page.evaluate(async (project) => {
    window.musart!.load(project);
    await window.musart!.save();
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("musart-studio");
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const database = request.result;
        const transaction = database.transaction("preferences", "readwrite");
        transaction
          .objectStore("preferences")
          .put(
            JSON.stringify({ version: 1, values: { workspaceMode: "studio" } }),
            JSON.stringify(["musart:project-layout", project.id]),
          );
        transaction.oncomplete = () => {
          database.close();
          resolve();
        };
        transaction.onabort = () => {
          database.close();
          reject(transaction.error);
        };
      };
    });
  }, project);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/ui/studio/StudioChrome.tsx*", async (route) => {
    await gate;
    await route.continue();
  });
  try {
    await page.goto(`/editor?automation=1&project=${project.id}`, {
      waitUntil: "domcontentloaded",
    });
    const root = page.locator(".workspace-mode-root");
    await expect(root).toHaveAttribute("data-workspace-mode", "studio", { timeout: 40000 });
    await expect(root).toHaveAttribute("data-workspace-initializing", "true");
    await expect(page.locator(".musart-app")).toHaveCSS("visibility", "hidden");
    await expect(page.locator(".project-opening-surface:visible .ui-throbber")).toHaveCount(1);
    await expect(page.locator(".project-opening-surface:visible")).toContainText(project.name);
    await expect(page.locator("[data-workspace-transition-loader]")).toHaveCount(0);
  } finally {
    release();
  }
  await expect(page.locator(".musart-app")).toHaveCSS("visibility", "visible", { timeout: 40000 });
  await expect(page.locator(".workspace-mode-root")).toHaveAttribute(
    "data-workspace-mode",
    "studio",
  );
  await expect(page.locator(".workspace-mode-root")).toHaveAttribute(
    "data-workspace-transition",
    "idle",
  );
  await expect(page.locator(".editor-gpu-scene canvas")).toHaveAttribute(
    "data-renderer-ready",
    "true",
  );
  expect(await page.evaluate(() => Reflect.get(window, "workspacePaintWitness"))).toEqual([
    "studio",
  ]);
  await expect(page.locator('[data-studio-effect-category="effect"] svg')).toHaveAttribute(
    "width",
    "24",
  );
  await expect(page.locator('[data-studio-effect-category="adjustment"] svg')).toHaveAttribute(
    "width",
    "24",
  );
  await expect(page.locator('[data-studio-effect-category="effect"] svg')).toHaveCSS(
    "width",
    "24px",
  );
  await expect(page.locator('[data-studio-effect-category="adjustment"] svg')).toHaveCSS(
    "width",
    "24px",
  );
  await page.screenshot({ path: "artifacts/studio/direct-studio-opening.png" });
});
