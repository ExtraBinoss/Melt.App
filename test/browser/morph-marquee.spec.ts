import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { morphContentBounds, type Project } from "@musart/core";
import { installReadbackProbe } from "./support/readback-probe";

const project = JSON.parse(
  readFileSync("apps/web/public/templates/motion/morphing-type/morphing-type.json", "utf8"),
).project as Project;
const composition = project.pages[0]!;
// Freeze the authored initial pose: this case tests native picking, not an advancing clock.
if (composition.motion) composition.motion.mode = "static";
const text = composition.layers.find((layer) => layer.id === "melt-wordmark")!;
const ink = morphContentBounds(text)!;

test("marquee selects visible Melt text from inside its empty frame, then adds the SVG mascot", async ({
  page,
}) => {
  await installReadbackProbe(page);
  await page.addInitScript(() => {
    localStorage.setItem("musart.language", "en");
    localStorage.setItem("musart.onboarding.v1", JSON.stringify({ version: 1, completed: true }));
  });
  await page.goto("/editor?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  await page.evaluate((data) => window.musart!.load(data), project);
  await page.waitForFunction(() => {
    const canvas = document.querySelector<HTMLCanvasElement>(".editor-gpu-scene canvas");
    return (
      canvas?.dataset.rendererReady === "true" &&
      canvas.dataset.sceneRevision === canvas.dataset.renderedRevision
    );
  });
  await expect(page.getByTestId("artboard")).toHaveAttribute("data-view-moving", "false");
  const board = (await page
    .locator(`.canvas-artboard-backdrop[data-artboard-id="${composition.id}"]`)
    .boundingBox())!;
  const zoom = board.width / composition.width;
  const point = (x: number, y: number) => ({ x: board.x + x * zoom, y: board.y + y * zoom });
  const drag = async (a: { x: number; y: number }, b: { x: number; y: number }) => {
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 10 });
    await page.mouse.up();
  };
  const before = await page.evaluate(() => window.musart!.snapshot().revision);
  await drag(
    point(text.x + ink.x - 15, text.y + ink.y - 15),
    point(text.x + ink.x + ink.width + 15, text.y + ink.y + ink.height + 15),
  );
  await expect
    .poll(() => page.evaluate(() => window.musart!.snapshot().selection))
    .toEqual([text.id]);
  await page.keyboard.down("Shift");
  await drag(point(5, 365), point(350, 715));
  await page.keyboard.up("Shift");
  const after = await page.evaluate(() => window.musart!.snapshot());
  expect(after.selection).toContain(text.id);
  expect(after.selection).toContain("melt-mascot-body");
  expect(after.revision).toBe(before);
  await page.keyboard.press("Escape");
  const partialFrom = point(text.x + ink.x - 15, text.y + ink.y - 15);
  const partialTo = point(text.x + ink.x + ink.width / 4, text.y + ink.y + ink.height / 2);
  await drag(partialFrom, partialTo);
  await expect
    .poll(() => page.evaluate(() => window.musart!.snapshot().selection))
    .toEqual([text.id]);
  await page.keyboard.press("Control+k");
  await page.getByRole("combobox", { name: "Search Melt", exact: true }).fill("editor settings");
  await page.getByRole("option", { name: /Editor settings & snapping distance/ }).click();
  const preferences = page.getByRole("dialog", { name: "Preferences", exact: true });
  const enclosure = preferences.getByRole("switch", {
    name: "Require full enclosure",
    exact: true,
  });
  await expect(enclosure).not.toBeChecked();
  await expect(
    preferences.getByRole("group", { name: "Selection rectangle examples" }),
  ).toBeVisible();
  await enclosure.click();
  await expect(enclosure).toBeChecked();
  expect(await page.evaluate(() => localStorage.getItem("musart.marquee-contain.v1"))).toBe("true");
  await page.screenshot({ path: "artifacts/marquee-preferences.png" });
  await page.keyboard.press("Escape");
  await expect(preferences).toBeHidden();
  await page.keyboard.press("Escape");
  await drag(partialFrom, partialTo);
  await expect.poll(() => page.evaluate(() => window.musart!.snapshot().selection)).toEqual([]);
  await drag(
    point(text.x + ink.x - 15, text.y + ink.y - 15),
    point(text.x + ink.x + ink.width + 15, text.y + ink.y + ink.height + 15),
  );
  await expect
    .poll(() => page.evaluate(() => window.musart!.snapshot().selection))
    .toEqual([text.id]);
  expect(await page.evaluate(() => window.__musartVideoReadbacks)).toMatchObject({
    gpu: 0,
    webgl: 0,
    canvas: 0,
  });
  await page.screenshot({ path: "artifacts/morph-marquee.png" });
});
