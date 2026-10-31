/** Bake the material picker from the production GPU graph: one renderer, one static atlas. */
import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import {
  createLayer,
  createPage,
  createProject,
  createSpatialLayer,
  createSpatialScene,
  SPATIAL_MATERIALS,
} from "@musart/core";
import config from "../../playwright.config";
import type {} from "../../apps/web/src/services/automation/automation";
const baseURL = process.env.SPATIAL_PREVIEW_URL ?? "http://127.0.0.1:6100";
const spatial = createSpatialScene();
spatial.camera.distance = 4.2;
spatial.environment.intensity = 1;
const project = createProject({
  id: "material-atlas",
  pages: [
    createPage({
      id: "materials",
      width: 500,
      height: 600,
      background: "#F4F4F6",
      spatial,
      layers: SPATIAL_MATERIALS.map((material, index) =>
        createLayer("rectangle", {
          id: `material-${material.id}`,
          name: material.id,
          x: (index % 5) * 100,
          y: Math.floor(index / 5) * 100,
          width: 100,
          height: 100,
          fill: material.color,
          spatial: { ...createSpatialLayer("sphere"), material: { ...material.settings } },
        }),
      ),
    }),
  ],
});
const browser = await chromium.launch({
  ...config.use?.launchOptions,
  executablePath: process.env.CHROME_PATH ?? "/opt/google/chrome/chrome",
});
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  await page.addInitScript(() =>
    localStorage.setItem("musart.onboarding.v1", JSON.stringify({ version: 1, completed: true })),
  );
  await page.goto(`${baseURL}/editor?automation=1`);
  await page.waitForFunction(() => Boolean(window.musart));
  await page.evaluate((project) => window.musart!.load(project), project);
  await page.locator(".editor-gpu-scene canvas").waitFor();
  await page.waitForFunction(
    () =>
      document.querySelector<HTMLCanvasElement>(".editor-gpu-scene canvas")?.dataset
        .rendererReady === "true",
    null,
    { timeout: 60000 },
  );
  const image = await page.evaluate(() => window.musart!.render({ format: "png", scale: 2 }));
  if (!image.startsWith("data:image/png;base64,")) throw Error("Material atlas did not render");
  await mkdir("apps/web/public/spatial", { recursive: true });
  await writeFile(
    "apps/web/public/spatial/materials.png",
    Buffer.from(image.split(",")[1]!, "base64"),
  );
  console.log("Rendered 30 native material spheres to apps/web/public/spatial/materials.png");
} finally {
  await browser.close();
}
