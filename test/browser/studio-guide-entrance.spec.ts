import { expect, test } from "@playwright/test";
import { createLayer, createPage, createProject } from "@musart/core";

for (const reduced of [false, true]) {
  test(`Studio Show guides shares the palette entrance and keeps text stable (reduced=${reduced})`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: reduced ? "reduce" : "no-preference" });
    await page.addInitScript(() => {
      localStorage.setItem("musart.language", "en");
      localStorage.setItem("musart.editor-tutorial.v1", "done");
    });
    await page.goto("/editor?automation=1&workspace=studio");
    await page.waitForFunction(() => Boolean(window.musart));
    await page.evaluate(
      (project) => window.musart!.load(project),
      createProject({
        pages: [
          createPage({
            width: 320,
            height: 240,
            layers: [createLayer("rectangle", { width: 180, height: 140, fill: "#8757ff" })],
          }),
        ],
      }),
    );
    await expect(page.locator(".editor-gpu-scene canvas")).toHaveAttribute(
      "data-presentation-ready",
      "true",
    );
    await page.evaluate(() => {
      document.documentElement.dataset.guideEntrances = "[]";
      document.addEventListener("animationstart", (event) => {
        if (!(event.target instanceof HTMLElement)) return;
        const kind = event.target.matches("[data-studio-guide-controls]")
          ? "controls"
          : event.target.matches("[data-studio-capture]")
            ? "canvas"
            : event.target.matches(".studio-capture-popover")
              ? "panel"
              : null;
        if (!kind) return;
        const entries = JSON.parse(document.documentElement.dataset.guideEntrances!) as {
          kind: string;
          name: string;
          transform: string;
        }[];
        entries.push({
          kind,
          name: event.animationName,
          transform: getComputedStyle(event.target).transform,
        });
        document.documentElement.dataset.guideEntrances = JSON.stringify(entries);
      });
    });
    const trigger = page.getByRole("button", { name: "Capture guides", exact: true });
    await trigger.click();
    const popup = page.locator(".studio-capture-popover.palette-panel");
    const toggle = popup.getByRole("switch", { name: "Show guides", exact: true });
    const controls = popup.locator("[data-studio-guide-controls]");
    const guide = page.locator("[data-studio-capture]");
    await expect(controls).toHaveCount(0);
    const before = await page.evaluate(() => window.musart!.snapshot().revision);
    await toggle.click();
    await expect(controls).toBeVisible();
    await expect(guide).toBeVisible();
    await expect(toggle).toBeFocused();
    expect(await page.evaluate(() => window.musart!.snapshot().revision)).toBe(before + 1);
    const read = () =>
      page.evaluate(
        () =>
          JSON.parse(document.documentElement.dataset.guideEntrances!) as {
            kind: string;
            name: string;
            transform: string;
          }[],
      );
    if (reduced) {
      await expect(controls).toHaveCSS("animation-name", "none");
      await expect(guide).toHaveCSS("animation-name", "none");
      expect(await read()).toEqual([]);
    } else {
      await expect
        .poll(async () => (await read()).map((entry) => `${entry.kind}:${entry.name}`))
        .toEqual(
          expect.arrayContaining([
            "panel:palette-panel-fade",
            "controls:musart-blur-fade",
            "canvas:palette-panel-fade",
          ]),
        );
      expect((await read()).every((entry) => entry.transform === "none")).toBe(true);
      await expect(controls).toHaveCSS("filter", "none");
    }
    const count = (await read()).filter((entry) => entry.kind === "controls").length;
    await popup.locator('[data-preset-id="tiktok-video"]').click();
    await popup.getByRole("combobox", { name: "Guide color", exact: true }).click();
    await page.getByRole("option", { name: "Magenta", exact: true }).click();
    expect((await read()).filter((entry) => entry.kind === "controls")).toHaveLength(count);
    await toggle.click();
    await expect(controls).toHaveCount(0);
    await toggle.click();
    await expect(controls).toBeVisible();
    if (!reduced)
      await expect
        .poll(async () => (await read()).filter((entry) => entry.kind === "controls").length)
        .toBe(count + 1);
    await expect(page.locator("body")).not.toHaveAttribute("data-scroll-locked");
    await expect(page.locator("body")).not.toHaveCSS("pointer-events", "none");
    await page.keyboard.press("Escape");
    await expect(popup).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });
}
