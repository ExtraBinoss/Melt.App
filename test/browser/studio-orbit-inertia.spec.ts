import { test, expect, type Page } from "@playwright/test";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import type { Project } from "@musart/core";
import { installReadbackProbe } from "./support/readback-probe";

async function open(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("musart.language", "en");
    localStorage.setItem("musart.editor-tutorial.v1", "done");
  });
  await installReadbackProbe(page);
  await page.goto("/editor?automation=1&workspace=studio&profile3d=1");
  await page.waitForFunction(() => !!window.musart);
  const { project } = JSON.parse(await readFile("apps/web/public/templates/designed/studio-starter/studio-starter.json", "utf8")) as { project: Project };
  await page.evaluate((p) => { window.musart!.load(p); window.musart!.select([]); }, project);
  const canvas = page.locator(".editor-gpu-scene canvas");
  await expect(canvas).toHaveAttribute("data-page-id", "studio-starter-composition");
  await ready(page);
  return canvas;
}
async function ready(page: Page) {
  await page.waitForFunction(() => {
    const c = document.querySelector<HTMLCanvasElement>(".editor-gpu-scene canvas");
    return c?.dataset.presentationReady === "true" && c.dataset.sceneRevision === c.dataset.renderedRevision;
  }, undefined, { timeout: 45000 });
}
const documentValue = (page: Page) => page.evaluate(() => JSON.stringify(window.musart!.snapshot().project));
const revision = (page: Page) => page.evaluate(() => window.musart!.session().revision);
const pose = (page: Page) => page.locator(".editor-gpu-scene canvas").evaluate((c) => JSON.parse((c as HTMLCanvasElement).dataset.spatialCamera!) as { yaw: number; pitch: number; distance: number });
const counters = (page: Page) => page.locator(".musart-app,.canvas-area,.editor-canvas,.editor-gpu-scene").evaluateAll((nodes) => nodes.map((n) => n.getAttribute("data-react-renders")));

test("native orbit has a visible bounded tail, one undo, Ctrl-wheel camera zoom and no idle work", async ({ page }) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const canvas = await open(page);
  const before = await documentValue(page), rev = await revision(page);
  const parent = await counters(page);
  await page.evaluate(() => {
    const c = document.querySelector<HTMLCanvasElement>(".editor-gpu-scene canvas")!;
    const start = performance.now();
    const frames: { t: number; phase?: string; pose?: string }[] = [];
    const observer = new MutationObserver(() => frames.push({ t: performance.now() - start, phase: c.dataset.spatialOrbitState, pose: c.dataset.spatialCamera }));
    observer.observe(c, { attributes: true, attributeFilter: ["data-rendered-revision"] });
    Object.assign(window, { __orbitFrames: frames, __stopOrbit: () => observer.disconnect() });
  });
  const bounds = (await page.getByTestId("editor-canvas").boundingBox())!;
  await page.mouse.move(bounds.x + 140, bounds.y + bounds.height * .7);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 300, bounds.y + bounds.height * .7, { steps: 18 });
  expect(await documentValue(page)).toBe(before);
  await page.mouse.up();
  await expect(canvas).toHaveAttribute("data-spatial-orbit-state", "coast");
  expect(await counters(page)).toEqual(parent);
  const released = await pose(page);
  await expect.poll(async () => Math.abs((await pose(page)).yaw - released.yaw)).toBeGreaterThan(.002);
  await expect.poll(() => revision(page)).toBe(rev + 1);
  await ready(page);
  const frames = await page.evaluate(() => {
    (window as unknown as { __stopOrbit: () => void }).__stopOrbit();
    return (window as unknown as { __orbitFrames: { t: number; phase?: string; pose?: string }[] }).__orbitFrames;
  });
  expect(frames.filter((f) => f.phase === "coast").length).toBeGreaterThan(0);
  await page.evaluate(() => window.musart!.undo()); await ready(page);
  expect(await documentValue(page)).toBe(before);
  const zoom = await page.getByTestId("artboard").getAttribute("data-zoom");
  for (const modifier of [false, true]) {
    const distance = (await pose(page)).distance, zoomRev = await revision(page);
    if (modifier) await page.keyboard.down("Control");
    await page.mouse.wheel(0, -80); await page.mouse.wheel(0, -80);
    if (modifier) await page.keyboard.up("Control");
    await expect.poll(async () => (await pose(page)).distance).toBeLessThan(distance);
    await expect.poll(() => revision(page)).toBe(zoomRev + 1); await ready(page);
    expect(await page.getByTestId("artboard").getAttribute("data-zoom")).toBe(zoom);
    await page.evaluate(() => window.musart!.undo()); await ready(page);
    expect(await documentValue(page)).toBe(before);
  }
  await page.mouse.down(); await page.mouse.move(bounds.x + 440, bounds.y + bounds.height * .7, { steps: 12 }); await page.mouse.up();
  await expect(canvas).toHaveAttribute("data-spatial-orbit-state", "coast");
  await page.keyboard.press("Escape"); await ready(page);
  expect(await documentValue(page)).toBe(before);
  await page.mouse.move(0, 0); await page.waitForTimeout(1700);
  const idle = await canvas.getAttribute("data-render-frames"); await page.waitForTimeout(400);
  expect(await canvas.getAttribute("data-render-frames")).toBe(idle);
  expect(await page.evaluate(() => window.__musartVideoReadbacks)).toMatchObject({ gpu: 0, webgl: 0, canvas: 0, videoFrame: 0 });
  await mkdir("artifacts/studio", { recursive: true });
  await writeFile("artifacts/studio/orbit-native-frames.json", JSON.stringify({ frames, backend: await canvas.getAttribute("data-backend"), errors }, null, 2));
  expect(errors).toEqual([]);
});

test("real mobile touch rotates with inertia, pinches the scene camera and recovers cancelled touch owners", async ({ browser }) => {
  test.setTimeout(120000);
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  const page = await context.newPage();
  try {
    const canvas = await open(page), client = await context.newCDPSession(page);
    const before = await documentValue(page), rev = await revision(page);
    await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 50, y: 530, id: 1 }] });
    for (let i = 1; i <= 10; i++) {
      await client.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: 50 + i * 8, y: 530, id: 1 }] });
      await page.waitForTimeout(12);
    }
    expect(await documentValue(page)).toBe(before);
    await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await expect(canvas).toHaveAttribute("data-spatial-orbit-state", "coast");
    await expect.poll(() => revision(page)).toBe(rev + 1); await ready(page);
    await page.evaluate(() => window.musart!.undo()); await ready(page);
    expect(await documentValue(page)).toBe(before);
    const zoomRev = await revision(page), distance = (await pose(page)).distance;
    const zoom = await page.getByTestId("artboard").getAttribute("data-zoom");
    await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 90, y: 510, id: 2 }, { x: 220, y: 510, id: 3 }] });
    for (let i = 1; i <= 8; i++) {
      await client.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: 90 - i * 4, y: 510, id: 2 }, { x: 220 + i * 4, y: 510, id: 3 }] });
      await page.waitForTimeout(16);
    }
    expect(await revision(page)).toBe(zoomRev);
    await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await expect.poll(() => revision(page)).toBe(zoomRev + 1); await ready(page);
    expect((await pose(page)).distance).toBeLessThan(distance);
    expect(await page.getByTestId("artboard").getAttribute("data-zoom")).toBe(zoom);
    await page.evaluate(() => window.musart!.undo()); await ready(page);
    await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 50, y: 530, id: 4 }] });
    await client.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: 120, y: 530, id: 4 }] });
    await client.send("Input.dispatchTouchEvent", { type: "touchCancel", touchPoints: [] }); await ready(page);
    expect(await documentValue(page)).toBe(before);
    expect(await page.evaluate(() => window.__musartVideoReadbacks)).toMatchObject({ gpu: 0, webgl: 0, canvas: 0, videoFrame: 0 });
    await page.screenshot({ path: "artifacts/studio/mobile-orbit-fullscreen.png" });
  } finally { await context.close(); }
});
