import { expect, test } from "@playwright/test";
import { createLayer, createPage, createProject } from "../../packages/core/src/index";

test("Studio guides stay in the capture popup, preview colors, undo inputs and leave rendered artwork unchanged", async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.routeWebSocket("**", () => {});
  await page.addInitScript(() => {
    localStorage.setItem("musart.language", "en");
    localStorage.setItem("musart.editor-tutorial.v1", "done");
  });
  await page.goto("/editor?automation=1&workspace=studio");
  await page.waitForFunction(() => !!window.musart, undefined, { timeout: 60000 });
  const project = createProject({
    pages: [
      createPage({
        id: "guide-canvas",
        width: 240,
        height: 160,
        rulers: true,
        layers: [
          createLayer("rectangle", { x: 40, y: 20, width: 150, height: 100, fill: "#954bee" }),
        ],
      }),
    ],
  });
  await page.evaluate((project) => window.musart!.load(project), project);
  const canvas = page.locator(".editor-gpu-scene canvas");
  await expect(canvas).toHaveAttribute("data-presentation-ready", "true", { timeout: 60000 });
  const snapshot = await page.evaluate(() => JSON.stringify(window.musart!.snapshot()));
  const bounds = await canvas.boundingBox();
  const image = await page.evaluate(() => window.musart!.render({ format: "png" }));
  await page.keyboard.press("Control+r");
  await page.keyboard.press("Control+r");
  expect(await page.evaluate(() => JSON.stringify(window.musart!.snapshot()))).toBe(snapshot);
  expect(await canvas.boundingBox()).toEqual(bounds);
  await expect(page.locator(".canvas-rulers:not([hidden])")).toHaveCount(0);
  await expect(page.getByRole("switch", { name: "Show guides", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Capture guides", exact: true }).click();
  const popover = page.locator(".studio-capture-popover");
  await expect(popover.getByRole("combobox")).toHaveCount(0);
  const toggle = popover.getByRole("switch", { name: "Show guides", exact: true });
  await toggle.click();
  await popover.locator('[data-preset-id="tiktok-video"]').click();
  const width = popover.getByRole("textbox", { name: "Width", exact: true });
  const height = popover.getByRole("textbox", { name: "Height", exact: true });
  const revision = await page.evaluate(() => window.musart!.snapshot().revision);
  await width.fill("1200");
  expect(
    await page.evaluate(() => window.musart!.snapshot().project.pages[0]!.captureGuides!.width),
  ).toBe(1080);
  await width.press("Enter");
  expect(await page.evaluate(() => window.musart!.snapshot().revision)).toBe(revision + 1);
  await page.keyboard.press("Control+z");
  await expect(width).toHaveValue("1080");
  await page.keyboard.press("Control+Shift+z");
  await expect(width).toHaveValue("1200");
  await height.fill("2048");
  await height.press("Tab");
  expect(
    await page.evaluate(() => window.musart!.snapshot().project.pages[0]!.captureGuides!.height),
  ).toBe(2048);
  await page.keyboard.press("Control+z");
  await expect(height).toHaveValue("1920");
  await page.keyboard.press("Control+Shift+z");
  await expect(height).toHaveValue("2048");
  await width.fill("1080");
  await width.press("Enter");
  await height.fill("1920");
  await height.press("Enter");
  for (const focused of [toggle, width]) {
    await focused.focus();
    const beforeScrub = await page.evaluate(() => window.musart!.snapshot().revision);
    const scrub = (await popover
      .getByRole("button", { name: "Adjust Width", exact: true })
      .boundingBox())!;
    await page.mouse.move(scrub.x + scrub.width / 2, scrub.y + scrub.height / 2);
    await page.mouse.down();
    await page.mouse.move(scrub.x + scrub.width / 2 + 35, scrub.y + scrub.height / 2, { steps: 5 });
    await page.mouse.up();
    expect(await page.evaluate(() => window.musart!.snapshot().revision)).toBe(beforeScrub + 1);
    const draggedWidth = await width.inputValue();
    expect(draggedWidth).not.toBe("1080");
    await page.keyboard.press("Control+z");
    await expect(width).toHaveValue("1080");
    expect(
      await page.evaluate(() => window.musart!.snapshot().project.pages[0]!.captureGuides!.width),
    ).toBe(1080);
    await page.keyboard.press("Control+Shift+z");
    await expect(width).toHaveValue(draggedWidth);
    expect(
      await page.evaluate(() => window.musart!.snapshot().project.pages[0]!.captureGuides!.width),
    ).toBe(Number(draggedWidth));
    await width.fill("1080");
    await width.press("Enter");
  }
  await popover.getByRole("combobox", { name: "Guide color", exact: true }).click();
  await page.getByRole("option", { name: "Magenta", exact: true }).hover();
  await expect(page.locator("[data-studio-capture]")).toHaveCSS(
    "border-top-color",
    "rgb(240, 171, 252)",
  );
  await page.getByRole("option", { name: "Magenta", exact: true }).click();
  await popover.getByRole("combobox", { name: "Guide color", exact: true }).click();
  await page.getByRole("option", { name: "Lime", exact: true }).hover();
  await expect(page.locator("[data-studio-capture]")).toHaveCSS(
    "border-top-color",
    "rgb(190, 242, 100)",
  );
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-studio-capture]")).toHaveCSS(
    "border-top-color",
    "rgb(240, 171, 252)",
  );
  await popover.getByRole("combobox", { name: "Safe margin", exact: true }).click();
  await page.getByRole("option", { name: "Custom margin", exact: true }).click();
  const margin = popover.getByRole("textbox", { name: "Margin", exact: true });
  await margin.fill("15");
  await margin.press("Enter");
  await page.keyboard.press("Control+z");
  await expect(margin).toHaveValue("10");
  await page.keyboard.press("Control+Shift+z");
  await expect(margin).toHaveValue("15");
  await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe("");
  await toggle.click();
  await expect(popover.getByRole("combobox")).toHaveCount(0);
  await page.keyboard.press("Escape");
  expect(await page.evaluate(() => window.musart!.render({ format: "png" }))).toBe(image);
  const output = await page.evaluate(() => window.musart!.snapshot().project.pages[0]!);
  expect(output.width).toBe(240);
  expect(output.height).toBe(160);
  expect(output.captureGuides).toMatchObject({
    width: 1080,
    height: 1920,
    margin: 15,
    color: "magenta",
    visible: false,
  });
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await expect(
    page.locator(".export-dialog").getByRole("textbox", { name: "Width", exact: true }),
  ).toHaveValue("1080");
  await expect(
    page.locator(".export-dialog").getByRole("textbox", { name: "Height", exact: true }),
  ).toHaveValue("1920");
});
