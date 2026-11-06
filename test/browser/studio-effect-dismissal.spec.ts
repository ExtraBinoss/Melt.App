import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  createEffect,
  createLayer,
  createPage,
  createProject,
  createSpatialLayer,
  createSpatialScene,
} from "@musart/core";

async function scrollToBottom(page: Page, shadow: Locator, requireOverflow = true) {
  const viewport = shadow.locator(":scope > :first-child");
  const overflow = await viewport.evaluate((node) => node.scrollHeight - node.clientHeight);
  if (!requireOverflow && overflow <= 1) {
    await expect(shadow).not.toHaveAttribute("data-overflow-top", "");
    await expect(shadow).not.toHaveAttribute("data-overflow-bottom", "");
    return;
  }
  await expect(shadow).toHaveAttribute("data-overflow-bottom", "");
  await viewport.hover({ position: { x: 12, y: 12 } });
  await page.mouse.wheel(0, 10000);
  await expect(shadow).toHaveAttribute("data-overflow-top", "");
  await expect(shadow).not.toHaveAttribute("data-overflow-bottom", "");
}

test("Studio effect editors keep shared scroll surfaces and native dismissal, menu input and focus", async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.addInitScript(() => {
    localStorage.setItem("musart.language", "en");
    localStorage.setItem("musart.editor-tutorial.v1", "done");
  });
  await page.routeWebSocket("**", () => {});
  await page.goto("/editor?automation=1&workspace=studio");
  await page.waitForFunction(() => Boolean(window.musart));
  const scene = createSpatialScene();
  scene.environment.preset = "none";
  scene.reflections!.mode = "environment";
  const project = createProject({
    pages: [
      createPage({
        id: "studio-effect-dismissal",
        width: 480,
        height: 320,
        spatial: scene,
        effects: [createEffect("exposure")],
        layers: [
          createLayer("rectangle", {
            id: "sphere",
            x: 160,
            y: 80,
            width: 160,
            height: 160,
            spatial: createSpatialLayer("sphere"),
          }),
        ],
      }),
    ],
  });
  await page.evaluate((value) => {
    window.musart!.load(value);
    window.musart!.select([]);
  }, project);
  const canvas = page.locator(".editor-gpu-scene canvas");
  await expect(canvas).toHaveAttribute("data-page-id", "studio-effect-dismissal", {
    timeout: 40000,
  });
  await expect(canvas).toHaveAttribute("data-presentation-ready", "true", { timeout: 40000 });
  const locks = await page.evaluateHandle(() => {
    const mutations: string[] = [];
    const observer = new MutationObserver((records) => {
      mutations.push(...records.map((record) => record.attributeName!));
    });
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ["style", "data-scroll-locked"],
    });
    return { mutations, observer };
  });
  const panel = page.locator('.studio-effects-popover[data-state="open"]');
  for (const category of ["effect", "adjustment"]) {
    await page.evaluate(() => window.musart!.select(["sphere"]));
    const trigger = page.locator(`[data-studio-effect-category="${category}"]`);
    await expect(
      page.locator(".studio-actions").locator(`[data-studio-effect-category="${category}"]`),
    ).toHaveCount(1);
    await expect(
      page.locator(".studio-quick-add").locator(`[data-studio-effect-category="${category}"]`),
    ).toHaveCount(0);
    await trigger.click();
    await expect(panel).toBeFocused();
    await scrollToBottom(page, panel.locator(".studio-effects-scroll"));
    // A deliberate content click must not leave Radix believing the next canvas
    // pointerdown is still inside its React tree.
    await panel.locator(".studio-effects-owner").click();
    await expect(panel).toBeVisible();
    const bounds = (await canvas.boundingBox())!;
    await page.mouse.click(bounds.x + 24, bounds.y + bounds.height * 0.55);
    await expect(panel).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => window.musart!.snapshot().selection)).toEqual([]);
    await trigger.click();
    await expect(panel).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(panel).toHaveCount(0);
    await expect(trigger).toBeFocused();
  }
  const trigger = page.locator('[data-studio-effect-category="adjustment"]');
  await trigger.click();
  await panel.getByRole("button", { name: "Stack (1)", exact: true }).click();
  const actions = panel.getByRole("button", { name: "Exposure · Actions", exact: true });
  await actions.click();
  const menu = page.getByRole("menu");
  await expect(menu).toBeVisible();
  await menu
    .getByRole("menuitem", { name: "Remove effect", exact: true })
    .click({ button: "right" });
  await expect(menu).toBeVisible();
  await expect(panel).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => window.musart!.snapshot().project.pages[0]!.effects?.length))
    .toBe(1);
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(actions).toBeFocused();
  await expect(panel).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await page.evaluate(() => window.musart!.select(["sphere"]));
  await page.getByRole("button", { name: "Compositions", exact: true }).click();
  await page.getByRole("button", { name: "Advanced controls", exact: true }).click();
  const advanced = page.locator(".studio-advanced-popover");
  await scrollToBottom(page, advanced.locator(".inspector-scroll"));
  expect(
    await advanced.evaluate((node) => node.scrollHeight - node.clientHeight),
  ).toBeLessThanOrEqual(1);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Scene", exact: true }).click();
  const environment = page.locator(".studio-environment-content");
  await scrollToBottom(page, environment.locator(".studio-sphere-library .scroll-shadow"));
  await scrollToBottom(page, environment.locator(".studio-sphere-properties-shadow"), false);
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 375, height: 800 });
  const projectButton = (await page
    .getByRole("button", { name: "Project actions", exact: true })
    .boundingBox())!;
  const actionsBar = (await page.locator(".studio-actions").boundingBox())!;
  expect(projectButton.x + projectButton.width).toBeLessThan(actionsBar.x);
  expect(actionsBar.x + actionsBar.width).toBeLessThanOrEqual(375);
  expect(await locks.evaluate(({ mutations }) => mutations)).toEqual([]);
  await locks.evaluate(({ observer }) => observer.disconnect());
  await locks.dispose();
});
