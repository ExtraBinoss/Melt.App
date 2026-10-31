import { expect, test } from "@playwright/test";
import {
  createLayer,
  createPage,
  createProject,
  EditorEngine,
  MOTION_ANIMATION_PRESETS,
} from "@musart/core";

async function language(page: import("@playwright/test").Page) {
  await page.addInitScript(() => {
    localStorage.setItem("musart.language", "en");
    localStorage.setItem("musart.onboarding.v1", JSON.stringify({ version: 1, completed: true }));
  });
}

test("Animations preserves groups, hover, editing and collapsed state when switching to Keyframes", async ({
  page,
}) => {
  await language(page);
  const group = createLayer("group", {
    id: "nested-group",
    name: "Nested motion",
    width: 300,
    height: 220,
  });
  const child = createLayer("rectangle", {
    id: "nested-child",
    parentId: group.id,
    name: "Animated child",
    width: 80,
    height: 70,
    fill: "#8855ff",
  });
  const engine = new EditorEngine(
    createProject({ pages: [createPage({ width: 480, height: 360, layers: [group, child] })] }),
  );
  engine.execute({ type: "setCompositionMode", mode: "motion" });
  for (const value of [0, 1])
    engine.execute({
      type: "upsertMotionKeyframe",
      target: { kind: "layer", layerId: group.id, property: "rotation" },
      time: { value: value * 2 + 1, rate: 2 },
      value: value * 360,
    });
  const track = engine
    .getSnapshot()
    .project.pages[0]!.motion!.tracks.find((track) => track.layerId === child.id)!;
  engine.execute({
    type: "addMotionAnimation",
    trackId: track.id,
    preset: MOTION_ANIMATION_PRESETS.find((preset) => preset.id === "move-left")!,
    start: { value: 0, rate: 1 },
    duration: { value: 1, rate: 1 },
  });
  await page.goto("/editor?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  await page.evaluate((project) => window.musart!.load(project), engine.getSnapshot().project);
  const timeline = page.locator(".motion-timeline");
  await expect(timeline).toBeVisible();
  await timeline.getByRole("button", { name: "Animations", exact: true }).click();
  const label = timeline.getByRole("button", { name: "Select Animated child", exact: true });
  await label.click();
  expect(await page.evaluate(() => window.musart!.snapshot().selection)).toEqual([child.id]);
  const childRow = label.locator("xpath=ancestor::*[@data-layer-id][1]");
  await expect(childRow).toHaveClass(/is-selected/);
  await label.hover();
  await expect(label.locator("xpath=ancestor::*[@data-layer-id][1]")).toHaveAttribute(
    "data-motion-hovered",
    "true",
  );
  const block = timeline.locator("button[data-animation-id]");
  const rawBlock = timeline.getByRole("button", { name: "Rotation, 1000 ms", exact: true });
  await expect(rawBlock).toBeVisible();
  await block.focus();
  await page.keyboard.press("ArrowRight");
  await expect
    .poll(() =>
      page.evaluate((id) => {
        const animation = window
          .musart!.snapshot()
          .project.pages[0]!.motion!.tracks.find((track) => track.id === id)!.animations![0]!;
        return animation.start.value / animation.start.rate;
      }, track.id),
    )
    .toBe(0.01);
  const before = await page.evaluate(() => window.musart!.snapshot().project);
  const bounds = (await block.boundingBox())!;
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width / 2 + 24, bounds.y + bounds.height / 2, {
    steps: 6,
  });
  expect(await page.evaluate(() => window.musart!.snapshot().project)).toEqual(before);
  await page.mouse.up();
  await expect
    .poll(() =>
      page.evaluate((id) => {
        const value = window
          .musart!.snapshot()
          .project.pages[0]!.motion!.tracks.find((item) => item.id === id)!.animations![0]!.start;
        return value.value / value.rate;
      }, track.id),
    )
    .toBeGreaterThan(0.01);
  await page.evaluate(() => window.musart!.undo());
  expect(await page.evaluate(() => window.musart!.snapshot().project)).toEqual(before);
  await block.click({ button: "right" });
  await expect(page.getByRole("menu")).toBeVisible();
  await page.keyboard.press("Escape");
  const groupLabel = timeline.getByRole("button", { name: "Select Nested motion", exact: true });
  await groupLabel.click();
  await expect(childRow).not.toHaveClass(/is-selected/);
  await expect(block).not.toHaveAttribute("data-selected", "true");
  await expect(groupLabel.locator("xpath=ancestor::*[@data-layer-id][1]")).toHaveClass(
    /is-selected/,
  );
  const rawBefore = await page.evaluate(() => window.musart!.snapshot().project);
  const raw = (await rawBlock.boundingBox())!;
  await page.mouse.move(raw.x + raw.width / 2, raw.y + raw.height / 2);
  await page.mouse.down();
  await page.mouse.move(raw.x + raw.width / 2 + 20, raw.y + raw.height / 2, { steps: 4 });
  await page.keyboard.press("Escape");
  await page.mouse.up();
  expect(await page.evaluate(() => window.musart!.snapshot().project)).toEqual(rawBefore);
  await timeline.getByRole("button", { name: "Collapse Nested motion", exact: true }).click();
  await expect(label).toHaveCount(0);
  await timeline.getByRole("button", { name: "Keyframes", exact: true }).click();
  const expand = timeline.getByRole("button", { name: "Expand Nested motion", exact: true });
  await expect(expand).toHaveAttribute("aria-expanded", "false");
  await expand.click();
  await expect(label).toBeVisible();
  const diamond = page.getByRole("button", { name: /(?:Add|Update) keyframe · Rotation/ });
  await expect(diamond).not.toHaveAttribute("title");
  await diamond.locator("..").hover();
  await expect(page.getByRole("tooltip")).toContainText("Animated property");
  await expect(
    page.locator(
      '[data-slot="tooltip-content"][data-state="delayed-open"], [data-slot="tooltip-content"][data-state="instant-open"]',
    ),
  ).toHaveAttribute("data-side", "top");
  await page.screenshot({ path: "artifacts/motion-hierarchy.png" });
});
