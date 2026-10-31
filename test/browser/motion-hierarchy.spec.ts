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
  await label.hover();
  await expect(label.locator("xpath=ancestor::*[@data-layer-id][1]")).toHaveAttribute(
    "data-motion-hovered",
    "true",
  );
  const block = timeline.locator("button.motion-animation-block");
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
  await timeline.getByRole("button", { name: "Collapse Nested motion", exact: true }).click();
  await expect(label).toHaveCount(0);
  await timeline.getByRole("button", { name: "Keyframes", exact: true }).click();
  const expand = timeline.getByRole("button", { name: "Expand Nested motion", exact: true });
  await expect(expand).toHaveAttribute("aria-expanded", "false");
  await expand.click();
  await expect(label).toBeVisible();
  await page.screenshot({ path: "artifacts/motion-hierarchy.png" });
});
