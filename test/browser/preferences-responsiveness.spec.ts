import { expect, test } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";

test("Shortcuts presents promptly, keeps navigation first and edits offscreen commands", async ({
  page,
  browser,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.addInitScript(() => {
    localStorage.setItem("musart.language", "en");
    localStorage.setItem("musart.onboarding.v1", JSON.stringify({ version: 1, completed: true }));
  });
  await page.goto("/editor?automation=1");
  await expect(page.locator('canvas[data-renderer-ready="true"]')).toBeVisible();
  await page.keyboard.press("Control+k");
  await page.locator("[cmdk-input]").fill("settings");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Preferences", exact: true });
  await expect(dialog).toBeVisible();
  await dialog.evaluate(async (el) => {
    await Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished.catch(() => {})));
  });
  const samples = [];
  for (let index = 0; index < 3; index++) {
    await page.evaluate(() => {
      const tab = [...document.querySelectorAll('[role="tab"]')].find(
        (el) => el.textContent === "Shortcuts",
      )!;
      (window as unknown as { shortcutProbe: Promise<unknown> }).shortcutProbe = new Promise(
        (resolve) => {
          tab.addEventListener(
            "pointerdown",
            (event) => {
              const start = event.timeStamp;
              let mounted = -1,
                visible = -1;
              const poll = () => {
                const list = document.querySelector(".shortcut-settings");
                if (list) {
                  if (mounted < 0) mounted = performance.now() - start;
                  const viewport = list.closest(".preferences-page-viewport")!;
                  const body = list.closest(".preferences-page-body")!;
                  const opacity =
                    Number(getComputedStyle(viewport).opacity) *
                    Number(getComputedStyle(body).opacity);
                  if (opacity > 0.05 && visible < 0) visible = performance.now() - start;
                  const active = viewport
                    .getAnimations({ subtree: true })
                    .some((a) => a.playState === "running");
                  if (visible >= 0 && !active) {
                    resolve({
                      mounted,
                      visible,
                      settled: performance.now() - start,
                      rows: list.querySelectorAll('[role="listitem"]').length,
                    });
                    return;
                  }
                }
                requestAnimationFrame(poll);
              };
              requestAnimationFrame(poll);
            },
            { once: true },
          );
        },
      );
    });
    await dialog.getByRole("tab", { name: "Shortcuts", exact: true }).click();
    samples.push(
      await page.evaluate(
        () => (window as unknown as { shortcutProbe: Promise<unknown> }).shortcutProbe,
      ),
    );
    if (index < 2) {
      await dialog.getByRole("tab", { name: "General", exact: true }).click();
      await dialog.evaluate(async (el) => {
        await Promise.all(
          el.getAnimations({ subtree: true }).map((a) => a.finished.catch(() => {})),
        );
      });
    }
  }
  const environment = await page.evaluate(async () => {
    const adapter = await navigator.gpu?.requestAdapter();
    return {
      dpr: devicePixelRatio,
      backend: document.querySelector<HTMLCanvasElement>('canvas[data-renderer-ready="true"]')
        ?.dataset.backend,
      adapter: adapter
        ? {
            vendor: adapter.info.vendor,
            architecture: adapter.info.architecture,
            device: adapter.info.device,
            description: adapter.info.description,
          }
        : null,
    };
  });
  await mkdir("artifacts/preferences", { recursive: true });
  await writeFile(
    `artifacts/preferences/${process.env.MELT_PREFS_BASELINE ? "before" : "after"}.json`,
    JSON.stringify(
      { browser: browser.version(), viewport: page.viewportSize(), environment, samples },
      null,
      2,
    ),
  );
  console.log("Preferences native presentation", samples);
  if (process.env.MELT_PREFS_BASELINE) return;
  const navigation = dialog.getByRole("region", { name: "Canvas navigation", exact: true });
  await expect(navigation).toBeInViewport();
  expect((await navigation.boundingBox())!.y).toBeLessThan(
    (await dialog.getByRole("searchbox").boundingBox())!.y,
  );
  const mounted = dialog.locator("[data-binding-command]");
  expect(await mounted.count()).toBeLessThan(25);
  const total = Number(await mounted.first().getAttribute("aria-setsize"));
  const edge = mounted.last();
  const index = Number(await edge.getAttribute("aria-posinset"));
  await edge.locator("button:not(:disabled)").last().focus();
  await page.keyboard.press("Tab");
  expect(
    await page.evaluate(() =>
      document.activeElement!.closest('[role="listitem"]')?.getAttribute("aria-posinset"),
    ),
  ).toBe(String(index + 1));
  const scrollport = dialog.locator(".preferences-page-viewport");
  await scrollport.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  await expect.poll(() => mounted.last().getAttribute("aria-posinset")).toBe(String(total));
  const last = mounted.last();
  await last.getByRole("button").first().focus();
  await expect(last).toBeInViewport();
  await last.getByRole("button").first().click();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("searchbox").fill("Save");
  const capture = dialog.getByRole("button", { name: "Change shortcut for Save", exact: true });
  await capture.click();
  await capture.press("Control+Alt+p");
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("musart.keybindings.v1")!).overrides["action:save"],
    ),
  ).toEqual([{ key: "p", mod: true, alt: true, shift: false }]);
  await dialog.getByRole("searchbox").fill("");
  await page.setViewportSize({ width: 460, height: 600 });
  const viewport = dialog.locator(".preferences-page-viewport");
  expect(await viewport.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({ path: "artifacts/preferences/narrow.png" });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await dialog.getByRole("tab", { name: "General", exact: true }).click();
  await dialog.getByRole("tab", { name: "Shortcuts", exact: true }).click();
  expect(await viewport.evaluate((el) => getComputedStyle(el).animationName)).toBe("none");
});
