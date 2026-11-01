import { expect, test } from "@playwright/test";
import type { AutomationApi } from "../../apps/web/src/services/automation/automation";

test("Angel playback retains local select sizing, native choice and inspector focus", async ({
  page,
}) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem("musart.language", "en");
    localStorage.setItem("musart.onboarding.v1", JSON.stringify({ version: 1, completed: true }));
  });
  await page.goto("/editor?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  await page.evaluate(async () => {
    const manifest = await fetch("/templates/motion/angel-windows.json").then((response) =>
      response.json(),
    );
    const api = window.musart as AutomationApi;
    api.load(manifest.project);
  });
  await page.locator('canvas[data-renderer-ready="true"]').waitFor();
  const shell = page.locator(".musart-app");
  const shellRenders = await shell.getAttribute("data-react-renders");
  expect(Number(shellRenders)).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await page.locator('.motion-export-preview-surface[data-preview-ready="true"]').waitFor();
  await expect(shell).toHaveAttribute("data-react-renders", shellRenders!);
  const player = page.locator(".export-dialog .media-player");
  const seek = player.getByRole("slider", { name: "Preview time" });
  await player.getByRole("button", { name: "Pause preview", exact: true }).click();
  await seek.focus();
  await page.keyboard.press("End");
  await expect(seek).toHaveAttribute("aria-valuenow", "12.8");
  await page.keyboard.press("Home");
  await expect(seek).toHaveAttribute("aria-valuenow", "0");
  const time = player.getByRole("textbox", { name: "Start time" });
  await time.fill("0:02.5");
  await time.press("Enter");
  await expect(seek).toHaveAttribute("aria-valuenow", "2.5");
  await seek.focus();
  await page.keyboard.press("ArrowRight");
  await expect(seek).toHaveAttribute("aria-valuenow", "2.501");
  await player.getByRole("button", { name: "Play preview", exact: true }).click();
  await expect
    .poll(async () => Number(await seek.getAttribute("aria-valuenow")))
    .toBeGreaterThan(2.501);
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
  const trigger = page.locator("#motion-export-scale");
  await page.evaluate(() => {
    const state = window as Window & { menuAdvanceMs?: number };
    const trigger = document.querySelector("#motion-export-scale")!;
    const seek = document.querySelector(
      '.export-dialog [role="slider"][aria-label="Preview time"]',
    )!;
    trigger.addEventListener(
      "pointerdown",
      () => {
        const started = performance.now(),
          before = seek.getAttribute("aria-valuenow");
        const tick = () => {
          if (seek.getAttribute("aria-valuenow") !== before)
            state.menuAdvanceMs = performance.now() - started;
          else if (performance.now() - started < 1500) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      },
      { once: true },
    );
  });
  await trigger.click();
  const list = page.getByRole("listbox");
  await expect(list).toBeVisible();
  await expect
    .poll(async () => {
      const field = await trigger.boundingBox(),
        menu = await list.boundingBox();
      return field && menu ? Math.abs(field.width - menu.width) : Infinity;
    })
    .toBeLessThan(1);
  await expect(list.getByRole("option", { selected: true })).toBeFocused();
  // Input-to-clock progress, measured from native pointer capture, not after menu settlement.
  await page.waitForFunction(
    () => (window as Window & { menuAdvanceMs?: number }).menuAdvanceMs !== undefined,
  );
  const advanceMs = await page.evaluate(
    () => (window as Window & { menuAdvanceMs?: number }).menuAdvanceMs!,
  );
  console.log("EXPORT_MENU_CLOCK_ADVANCE_MS", advanceMs);
  expect(advanceMs).toBeLessThan(240);
  const original = await trigger.textContent();
  const half = list.getByRole("option", { name: "0.5×", exact: true });
  await half.hover();
  await page.mouse.down({ button: "right" });
  await page.mouse.up({ button: "right" });
  await expect(trigger).toHaveText(original!);
  await expect(list).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await trigger.hover();
  await page.mouse.down();
  await expect(list).toBeVisible();
  await half.hover();
  await page.mouse.up();
  await expect(trigger).toHaveText("0.5×");
  await expect(list).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(list).toBeVisible();
  await page.keyboard.press("End");
  await expect(list.getByRole("option", { name: "4×", exact: true })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(trigger).toHaveText("4×");
  await expect(list).toHaveCount(0);
  expect(await locks.evaluate(({ mutations }) => mutations)).toEqual([]);
  await locks.evaluate(({ observer }) => observer.disconnect());
  await locks.dispose();
  await page.locator('.export-dialog [data-slot="dialog-close"]').click();
  await expect(page.locator(".export-dialog")).toHaveCount(0);
  await expect(shell).toHaveAttribute("data-react-renders", shellRenders!);
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await page.getByRole("button", { name: "fx Window trails", exact: true }).click();
  const inspector = page.locator('.layer-attachment-popover[data-state="open"]');
  await expect(inspector).toBeFocused();
  await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeVisible();
  // An unrelated publication must neither retire this editor nor stale its next input.
  await page.evaluate(() =>
    window.musart!.execute({ type: "updatePage", patch: { background: "#242424" } }),
  );
  await expect(inspector).toBeVisible();
  const opacity = inspector.getByRole("textbox", { name: "Opacity", exact: true });
  await opacity.fill("42");
  await opacity.press("Tab");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window
            .musart!.snapshot()
            .project.pages[0]!.layers.flatMap((layer) => layer.effects)
            .find((effect) => effect.type === "window-trails")?.opacity,
      ),
    )
    .toBe(0.42);
  await page.evaluate(() => window.musart!.undo());
  expect(await page.evaluate(() => window.musart!.snapshot().project.pages[0]!.background)).toBe(
    "#242424",
  );
  await page.keyboard.press("Escape");
  await expect(inspector).toHaveCount(0);
  expect(errors).toEqual([]);
});
