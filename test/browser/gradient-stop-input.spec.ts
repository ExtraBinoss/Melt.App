import { expect, test } from "@playwright/test";
import { createLayer, createPage, createProject, type FillGradient } from "@musart/core";

for (const owner of ["layer", "background"] as const) {
  test(`${owner} gradient stops support percentage scrubbing, native undo and double-click color editing`, async ({
    page,
  }) => {
    const gradient: FillGradient = {
      kind: "linear",
      angle: 0,
      stops: [
        { offset: 0, color: "#ff0000" },
        { offset: 0.5, color: "#00ff00" },
        { offset: 1, color: "#0000ff" },
      ],
    };
    await page.addInitScript(() => {
      localStorage.setItem("musart.language", "en");
      localStorage.setItem("musart.editor-tutorial.v1", "done");
      localStorage.setItem("musart.onboarding.v1", JSON.stringify({ version: 1, completed: true }));
    });
    await page.goto("/editor?automation=1&workspace=classic");
    await page.waitForFunction(() => !!window.musart);
    await page.evaluate(
      ({ project, owner }) => {
        window.musart!.load(project);
        window.musart!.select(owner === "layer" ? ["gradient-stop-layer"] : []);
      },
      {
        owner,
        project: createProject({
          pages: [
            createPage({
              width: 400,
              height: 300,
              ...(owner === "background" ? { backgroundGradient: gradient } : {}),
              layers: [
                createLayer("text", {
                  id: "gradient-stop-layer",
                  text: "Gradient",
                  fillGradient: gradient,
                }),
              ],
            }),
          ],
        }),
      },
    );
    const read = () =>
      page.evaluate((owner) => {
        const { project, revision, canUndo } = window.musart!.snapshot();
        const paint =
          owner === "background"
            ? project.pages[0]!.backgroundGradient!
            : project.pages[0]!.layers[0]!.fillGradient!;
        return { offset: paint.stops[1]!.offset, revision, canUndo };
      }, owner);
    const suffix = page.getByRole("button", { name: "Adjust Stop 2 position", exact: true });
    await suffix.scrollIntoViewIfNeeded();
    await expect(suffix).toHaveText("%");
    expect(await suffix.evaluate((node) => getComputedStyle(node).cursor)).toBe("ew-resize");
    const initial = await read();
    const box = (await suffix.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 50, box.y + box.height / 2, { steps: 5 });
    expect(await read()).toEqual(initial);
    await page.mouse.up();
    await expect.poll(async () => (await read()).offset).toBe(0.6);
    expect((await read()).revision).toBe(initial.revision + 1);
    const point = page.getByRole("slider", { name: "Stop 2", exact: true });
    const thumbBox = (await point.boundingBox())!;
    await page.mouse.move(thumbBox.x + thumbBox.width / 2, thumbBox.y + thumbBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(thumbBox.x + thumbBox.width / 2 - 25, thumbBox.y + thumbBox.height / 2, {
      steps: 5,
    });
    await page.mouse.up();
    const moved = (await read()).offset;
    expect(moved).not.toBe(0.6);
    await expect(point).toBeFocused();
    await page.keyboard.press("Control+z");
    await expect.poll(async () => (await read()).offset).toBe(0.6);
    await expect(point).toHaveAttribute("aria-valuenow", "60");
    await page.keyboard.press("Control+Shift+z");
    await expect.poll(async () => (await read()).offset).toBe(moved);
    await point.dblclick();
    await expect(point).toHaveAttribute("data-selected", "true");
    await expect(page.getByRole("dialog", { name: "Stop 2 color", exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await page.getByRole("slider", { name: "Stop 1", exact: true }).dblclick();
    await expect(page.getByRole("dialog", { name: "Stop 1 color", exact: true })).toBeVisible();
  });
}
