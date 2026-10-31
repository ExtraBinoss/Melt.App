import { expect, test } from "@playwright/test";
import {
  createLayer,
  createPage,
  createProject,
  createSpatialLayer,
  createSpatialScene,
} from "@musart/core";
import { writeFileSync, mkdirSync } from "node:fs";
import { installReadbackProbe } from "./support/readback-probe";
const spatial = createSpatialLayer("box");
spatial.rotationY = 20;
const page = createPage({
  id: "spatial-page",
  width: 900,
  height: 600,
  spatial: createSpatialScene(),
  layers: [
    createLayer("rectangle", {
      id: "box",
      x: 70,
      y: 130,
      width: 300,
      height: 300,
      fill: "#8757FF",
      spatial,
    }),
    createLayer("text", {
      id: "text",
      x: 430,
      y: 210,
      width: 420,
      height: 130,
      text: "Melt",
      fontSize: 110,
      fontWeight: 800,
      fill: "#22AA88",
      spatial: createSpatialLayer("extrude"),
    }),
    createLayer("vector", {
      id: "svg",
      x: 50,
      y: 440,
      width: 150,
      height: 130,
      fill: "#8757FF",
      spatial: createSpatialLayer("extrude"),
      vector: {
        viewBox: "0 0 100 100",
        preserveColors: true,
        parts: [
          { path: "M0 0H100V100H0Z", fill: "#8757FF" },
          { path: "M28 35H40V65H28Z M60 35H72V65H60Z", fill: "#FFFFFF" },
        ],
      },
    }),
  ],
});
const project = createProject({ id: "spatial-render", pages: [page] });
test("native 3D sources render and export through both Three backends without pixel readbacks", async ({
  page,
  browser,
}) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    errors.push(error.message);
    console.log("page-error", error.message);
  });
  page.on("console", (message) => {
    if (message.type() === "error" || message.text().includes("[Melt 3D]"))
      console.log(message.type(), message.text());
  });
  await installReadbackProbe(page);
  await page.addInitScript(() => {
    localStorage.setItem("musart.language", "en");
    localStorage.setItem("musart.onboarding.v1", JSON.stringify({ version: 1, completed: true }));
  });
  await page.goto("/editor?automation=1&profile3d=1");
  await page.waitForFunction(() => Boolean(window.musart));
  await page.evaluate((project) => window.musart!.load(project), project);
  const canvas = page.locator(".editor-gpu-scene canvas");
  await expect(canvas).toHaveAttribute("data-renderer-ready", "true", { timeout: 30000 });
  await expect(canvas).not.toHaveAttribute("data-render-error");
  mkdirSync("artifacts/spatial", { recursive: true });
  await page.screenshot({ path: "artifacts/spatial/first-canvas.png" });
  const png = await page.evaluate(() => window.musart!.render({ format: "png", scale: 0.5 }));
  const fallback = await page.evaluate(() =>
    window.musart!.render({ format: "png", scale: 0.5, forceWebGL: true }),
  );
  expect(await page.evaluate(() => window.__musartVideoReadbacks)).toMatchObject({
    gpu: 0,
    canvas: 0,
    webgl: 0,
  });
  writeFileSync("artifacts/spatial/first-export.png", Buffer.from(png.split(",")[1]!, "base64"));
  writeFileSync(
    "artifacts/spatial/first-export-webgl.png",
    Buffer.from(fallback.split(",")[1]!, "base64"),
  );
  const inspection = await browser.newPage();
  try {
    for (const source of [png, fallback]) {
      const counts = await inspection.evaluate(async (source) => {
        const image = new Image();
        image.src = source;
        await image.decode();
        const c = document.createElement("canvas");
        c.width = image.width;
        c.height = image.height;
        const context = c.getContext("2d")!;
        context.drawImage(image, 0, 0);
        const data = context.getImageData(0, 0, c.width, c.height).data;
        let colored = 0,
          violet = 0,
          green = 0;
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i]!,
            g = data[i + 1]!,
            b = data[i + 2]!;
          if (Math.max(r, g, b) - Math.min(r, g, b) > 25) colored++;
          if (b > g + 25 && b > r) violet++;
          if (g > r + 20 && g > b) green++;
        }
        return { colored, violet, green };
      }, source);
      expect(counts.colored).toBeGreaterThan(1000);
      expect(counts.violet).toBeGreaterThan(300);
      expect(counts.green).toBeGreaterThan(100);
    }
  } finally {
    await inspection.close();
  }
  expect(errors).toEqual([]);
});
test("inline 3D mode keeps native gizmo edits, orbit and undo on the classic layer", async ({
  page,
}) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem("musart.language", "en");
    localStorage.setItem("musart.onboarding.v1", JSON.stringify({ version: 1, completed: true }));
  });
  await page.goto("/editor?automation=1&profile3d=1");
  await page.waitForFunction(() => Boolean(window.musart));
  await page.evaluate((project) => {
    window.musart!.load(project);
    window.musart!.select(["box"]);
  }, project);
  const canvas = page.locator(".editor-gpu-scene canvas");
  await expect(canvas).toHaveAttribute("data-renderer-ready", "true", { timeout: 30000 });
  const rendererCount = await canvas.getAttribute("data-renderer-instances");
  const toolbar = page.locator("[data-spatial-toolbar]");
  await expect(toolbar).toBeVisible();
  await toolbar.getByRole("radio", { name: "3D", exact: true }).click();
  expect(
    await toolbar
      .locator(".segmented-tab-label")
      .evaluateAll((nodes) => nodes.every((node) => node.scrollWidth <= node.clientWidth)),
  ).toBe(true);
  await expect(canvas).toHaveAttribute("data-spatial-center", /x/, { timeout: 15000 });
  await canvas.focus();
  await page.keyboard.press("r");
  await expect(toolbar.getByRole("button", { name: /Rotate/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  const center = JSON.parse((await canvas.getAttribute("data-spatial-center"))!) as {
    x: number;
    y: number;
  };
  const x = box!.x + box!.width * center.x,
    y = box!.y + box!.height * center.y;
  let picked: { x: number; y: number } | null = null;
  for (let radius = 18; radius <= 100 && !picked; radius += 14) {
    for (let angle = 0; angle < Math.PI * 2 && !picked; angle += Math.PI / 8) {
      const at = { x: x + Math.cos(angle) * radius, y: y + Math.sin(angle) * radius };
      await page.mouse.move(at.x, at.y);
      const state = JSON.parse((await canvas.getAttribute("data-spatial-gizmo")) ?? "{}") as {
        axis?: string | null;
      };
      if (["X", "Y", "Z"].includes(state.axis ?? "")) picked = at;
    }
  }
  expect(picked, "a native rotation ring must be pickable").not.toBeNull();
  const commits = () =>
    page.evaluate(() =>
      [...document.querySelectorAll("[data-react-renders]")].map((node) => [
        node.className,
        node.getAttribute("data-react-renders"),
      ]),
    );
  const before = await commits();
  await page.mouse.move(picked!.x, picked!.y);
  await page.mouse.down();
  await page.mouse.move(picked!.x + 35, picked!.y + 28, { steps: 8 });
  await expect(canvas).toHaveAttribute("data-renderer-ready", "true");
  expect(await commits()).toEqual(before);
  await page.mouse.up();
  const pose = await page.evaluate(
    () => window.musart!.snapshot().project.pages[0]!.layers[0]!.spatial,
  );
  expect(
    Math.abs(pose!.rotationX) + Math.abs(pose!.rotationY - 20) + Math.abs(pose!.rotationZ),
  ).toBeGreaterThan(0.5);
  await page.evaluate(() => window.musart!.undo());
  expect(
    await page.evaluate(() => window.musart!.snapshot().project.pages[0]!.layers[0]!.spatial),
  ).toEqual(spatial);
  await page.mouse.move(box!.x + (box!.width * 85) / 900, box!.y + (box!.height * 145) / 600);
  await page.mouse.down();
  await page.mouse.move(box!.x + (box!.width * 125) / 900, box!.y + (box!.height * 165) / 600, {
    steps: 8,
  });
  await page.mouse.up();
  const camera = await page.evaluate(
    () => window.musart!.snapshot().project.pages[0]!.spatial!.camera,
  );
  expect(Math.abs(camera.yaw - project.pages[0]!.spatial!.camera.yaw)).toBeGreaterThan(1);
  await page.evaluate(() => window.musart!.undo());
  expect(
    await page.evaluate(() => window.musart!.snapshot().project.pages[0]!.spatial!.camera),
  ).toEqual(project.pages[0]!.spatial!.camera);
  await page.evaluate(() => {
    const snapshot = window.musart!.snapshot(),
      scene = snapshot.project.pages[0]!.spatial!;
    window.musart!.execute({
      type: "updatePage",
      patch: { spatial: { ...scene, camera: { ...scene.camera, projection: "orthographic" } } },
    });
  });
  await expect(canvas).toHaveAttribute("data-spatial-projection", "OrthographicCamera");
  await expect(canvas).toHaveAttribute("data-renderer-ready", "true");
  await page.evaluate(() => window.musart!.undo());
  await expect(canvas).toHaveAttribute("data-spatial-projection", "PerspectiveCamera");
  await toolbar.getByRole("radio", { name: "2D", exact: true }).click();
  await expect(canvas).not.toHaveAttribute("data-spatial-center");
  await expect(canvas).toHaveAttribute("data-renderer-ready", "true");
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  const idle = await canvas.getAttribute("data-render-frames");
  await page.waitForTimeout(250);
  expect(await canvas.getAttribute("data-render-frames")).toBe(idle);
  expect(await canvas.getAttribute("data-renderer-instances")).toBe(rendererCount);
  expect(errors).toEqual([]);
});
