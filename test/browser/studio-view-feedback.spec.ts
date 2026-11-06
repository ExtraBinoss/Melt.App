import { expect, test } from "@playwright/test";

for (const workspace of ["studio", "classic"] as const) {
  test(`${workspace} recenter uses the localized shared success notice without editing the document`, async ({
    page,
  }) => {
    await page.addInitScript(() => {
      localStorage.setItem("musart.language", "fr");
      localStorage.setItem("musart.editor-tutorial.v1", "done");
      localStorage.setItem("musart.canvas-zoom-controls.v1", "true");
    });
    await page.goto(`/editor?automation=1&workspace=${workspace}`);
    await page.waitForFunction(() => Boolean(window.musart));
    await expect(page.locator(".editor-gpu-scene canvas")).toHaveAttribute(
      "data-presentation-ready",
      "true",
    );
    const before = await page.evaluate(() => ({
      project: JSON.stringify(window.musart!.snapshot().project),
      revision: window.musart!.snapshot().revision,
      bodyStyle: document.body.getAttribute("style"),
    }));
    await page
      .getByRole("button", {
        name: workspace === "studio" ? "Recentrer la vue" : "100 % · Recentrer",
        exact: true,
      })
      .click();
    const notice = page.locator(".editor-notice[role=status]");
    await expect(notice.locator(".notice-title")).toHaveText("Validé");
    await expect(notice.locator("p")).toHaveText("Vue recentrée");
    await expect(page.locator(".editor-feedback-stack")).toHaveAttribute(
      "data-notice-placement",
      workspace === "studio" ? "bottom-right" : "top-center",
    );
    expect(
      await page.evaluate(() => ({
        project: JSON.stringify(window.musart!.snapshot().project),
        revision: window.musart!.snapshot().revision,
        bodyStyle: document.body.getAttribute("style"),
      })),
    ).toEqual(before);
    await notice.getByRole("button", { name: "Fermer la notification" }).click();
    await expect(notice).toHaveCount(0);
  });
}

test("Studio keeps advanced settings inside Compositions and gives dock buttons visible hover feedback", async ({
  page,
}, info) => {
  await page.addInitScript(() => {
    localStorage.setItem("musart.language", "en");
    localStorage.setItem("musart.editor-tutorial.v1", "done");
  });
  await page.goto("/editor?automation=1&workspace=studio");
  await page.waitForFunction(() => Boolean(window.musart));
  await page.evaluate(async () => {
    const { project } = await (
      await fetch("/templates/designed/studio-starter/studio-starter.json")
    ).json();
    window.musart!.load(project);
    window.musart!.select([]);
  });
  await expect(page.locator(".editor-gpu-scene canvas")).toHaveAttribute(
    "data-presentation-ready",
    "true",
  );
  const advanced = page.getByRole("button", { name: "Advanced controls", exact: true });
  await expect(advanced).toHaveCount(0);
  const beforeBody = await page.locator("body").getAttribute("style");
  const compositions = page.getByRole("button", { name: "Compositions", exact: true });
  for (const button of [compositions, page.locator(".canvas-timeline-toggle")]) {
    await page.mouse.move(800, 500);
    await expect(button).not.toBeFocused();
    const before = await button.evaluate((element) => ({
      background: getComputedStyle(element).backgroundColor,
      bounds: element.getBoundingClientRect().toJSON(),
    }));
    await button.hover();
    await expect
      .poll(() => button.evaluate((element) => getComputedStyle(element).backgroundColor))
      .not.toBe(before.background);
    expect(await button.evaluate((element) => element.getBoundingClientRect().toJSON())).toEqual(
      before.bounds,
    );
  }
  await compositions.click();
  await expect(advanced).toBeVisible();
  await advanced.click();
  const editor = page.locator(".studio-advanced-popover");
  await expect(editor).toBeVisible();
  await expect(editor.locator(".inspector")).toBeVisible();
  await page.screenshot({ path: info.outputPath("advanced-context.png") });
  await page.keyboard.press("Escape");
  await expect(editor).toBeHidden();
  await expect(advanced).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(advanced).toHaveCount(0);
  await expect(compositions).toBeFocused();
  expect(await page.locator("body").getAttribute("style")).toBe(beforeBody);
  await expect(page.locator("body")).not.toHaveCSS("pointer-events", "none");
  await page.setViewportSize({ width: 390, height: 844 });
  await compositions.click();
  await advanced.click();
  await expect(editor).toBeVisible();
  const bounds = (await editor.boundingBox())!;
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
  await page.screenshot({ path: info.outputPath("advanced-mobile.png") });
});

test("Studio stacks five notices, fans them out on hover and keyboard focus, and clears scene controls", async ({
  page,
}, info) => {
  await page.addInitScript(() => {
    localStorage.setItem("musart.language", "en");
    localStorage.setItem("musart.editor-tutorial.v1", "done");
  });
  await page.goto("/editor?automation=1&workspace=studio");
  await page.waitForFunction(() => Boolean(window.musart));
  await expect(page.locator(".editor-gpu-scene canvas")).toHaveAttribute(
    "data-presentation-ready",
    "true",
  );
  const roots = ".musart-app, .canvas-area, .editor-canvas, .editor-gpu-scene";
  const commits = await page
    .locator(roots)
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-react-renders")));
  const recenter = page.getByRole("button", { name: "Recenter view", exact: true });
  for (let index = 0; index < 7; index++) await recenter.click();
  const cards = page.locator('.editor-feedback-stack [data-sonner-toast][data-removed="false"]');
  await expect(cards).toHaveCount(5);
  const front = cards.locator('[role="status"]').first();
  const environment = page.locator(".studio-environment");
  await expect
    .poll(async () => {
      const frontBounds = (await front.boundingBox())!,
        sceneBounds = (await environment.boundingBox())!;
      return frontBounds.y + frontBounds.height <= sceneBounds.y - 12;
    })
    .toBe(true);
  await front.hover();
  await expect(cards.first()).toHaveAttribute("data-expanded", "true");
  await expect
    .poll(async () => {
      const bounds = await cards.evaluateAll((nodes) =>
        nodes
          .map((node) => node.getBoundingClientRect())
          .sort((a, b) => a.top - b.top)
          .map((rect) => ({ top: rect.top, bottom: rect.bottom })),
      );
      return bounds.every(
        (rect, index) => index === 0 || rect.top >= bounds[index - 1]!.bottom + 8,
      );
    })
    .toBe(true);
  await page.waitForTimeout(4300);
  await expect(cards).toHaveCount(5);
  await page.screenshot({ path: info.outputPath("expanded-notices.png") });
  await page.mouse.move(800, 500);
  await page.keyboard.press("Alt+t");
  await expect(page.locator("[data-sonner-toaster]")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(cards.first()).toHaveAttribute("data-expanded", "true");
  expect(
    await page
      .locator(roots)
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-react-renders"))),
  ).toEqual(commits);
  await expect(page.locator("body")).not.toHaveCSS("pointer-events", "none");
});
