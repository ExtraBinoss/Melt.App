import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { createEffect, createLayer, createPage, createProject } from "@musart/core";

let context: BrowserContext;
let page: Page;
test.beforeAll(async ({ browser }, testInfo) => {
  context = await browser.newContext({
    baseURL: testInfo.project.use.baseURL,
    viewport: { width: 1440, height: 1000 },
  });
  page = await context.newPage();
  await page.addInitScript(() => {
    localStorage.setItem("musart.language", "fr");
    localStorage.setItem("musart.editor-tutorial.v1", "done");
  });
  await page.goto("/editor?automation=1&workspace=studio");
  await page.waitForFunction(() => !!window.musart);
});
test.afterAll(async () => {
  await context?.close();
});

test("Studio keeps direct Motion checked and transfers it into the existing ruler", async () => {
  const effect = createEffect("chromatic-aberration");
  const project = createProject({
    pages: [
      createPage({
        width: 320,
        height: 240,
        layers: [
          createLayer("rectangle", {
            id: "simple-subject",
            name: "Sujet",
            width: 180,
            height: 140,
            fill: "#8757ff",
            effects: [effect],
          }),
        ],
      }),
    ],
  });
  await page.evaluate((document) => {
    window.musart!.load(document);
    window.musart!.select(["simple-subject"]);
  }, project);
  const entry = page.locator(".canvas-timeline-toggle");
  await expect(entry).toBeVisible();
  await expect(entry).toHaveText("Motion");
  await expect(page.locator(".motion-timeline-dock")).toHaveCount(0);
  await entry.click();
  const dock = page.locator(".motion-timeline-dock");
  await expect(dock).toHaveCount(1);
  await expect(dock).toHaveAttribute("data-motion-pinned", "true");
  await expect(
    page.getByRole("slider", { name: "Se déplacer dans la timeline", exact: true }),
  ).toBeVisible();
  await expect(dock).not.toHaveAttribute("data-motion-animating");
  await page.locator('[data-studio-effect-category="effect"]').click();
  const stack = page.locator(".studio-effects-popover");
  await stack.getByRole("button", { name: "Pile (1)", exact: true }).click();
  const accordion = stack.getByRole("button", { name: "Aberration chromatique", exact: true });
  if ((await accordion.getAttribute("aria-expanded")) === "false") await accordion.click();
  await stack.getByRole("button", { name: "Motion", exact: true }).click();
  const controls = page.locator(".effect-motion[data-slot=popover-content]");
  await expect(controls).toBeVisible();
  await expect(controls.getByRole("combobox")).toHaveCount(0);
  await expect(controls.getByRole("spinbutton")).toHaveCount(0);
  for (const name of [
    "Boucle",
    "Aller-retour",
    "Pulsation",
    "Horizontal",
    "Vertical",
    "Libre",
    "Glisser",
    "Clic",
  ]) {
    const button = controls.getByRole("button", { name, exact: true });
    await expect(button).toBeVisible();
    await expect(button.locator("svg")).toHaveCount(1);
  }
  await controls.screenshot({ path: "artifacts/studio/motion-simple-controls.png" });
  await controls.getByRole("button", { name: "Boucle", exact: true }).click();
  await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeVisible();
  await expect(controls.getByRole("button", { name: "Boucle", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(
    await page.evaluate(
      () => window.musart!.snapshot().project.pages[0]!.motion!.tracks[0]!.animations?.length ?? 0,
    ),
  ).toBe(0);
  expect((await controls.boundingBox())!.width).toBeLessThanOrEqual(301);
  const readPlaybackWitness = () =>
    page.evaluate(() => ({
      revision: window.musart!.snapshot().revision,
      commits: Object.fromEntries(
        [".canvas-area", ".editor-canvas", ".editor-gpu-scene"].map((selector) => {
          const element = document.querySelector<HTMLElement>(selector);
          if (!element?.dataset.reactRenders) throw new Error(`Missing commit counter ${selector}`);
          return [selector, Number(element.dataset.reactRenders)];
        }),
      ),
    }));
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  const beforePlayback = await readPlaybackWitness();
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        let frames = 0;
        function frame() {
          if (++frames === 12) resolve();
          else requestAnimationFrame(frame);
        }
        requestAnimationFrame(frame);
      }),
  );
  expect(await readPlaybackWitness()).toEqual(beforePlayback);
  await controls.getByRole("button", { name: "Horizontal", exact: true }).click();
  await expect(controls.getByRole("button", { name: "Horizontal", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.keyboard.press("Escape"); // leave temporary test, retaining the choice
  await page.keyboard.press("Escape"); // close Motion
  await stack.getByRole("button", { name: "Motion", exact: true }).click();
  await expect(controls.getByRole("button", { name: "Horizontal", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await controls.getByRole("button", { name: "Enregistrer les gestes", exact: true }).click();
  const inputPad = controls.getByRole("application");
  const pad = (await inputPad.boundingBox())!;
  const recordingRevision = await page.evaluate(() => window.musart!.snapshot().revision);
  await page.mouse.move(pad.x + pad.width * 0.2, pad.y + pad.height * 0.5);
  await page.mouse.move(pad.x + pad.width * 0.8, pad.y + pad.height * 0.5, { steps: 8 });
  expect(await page.evaluate(() => window.musart!.snapshot().revision)).toBe(recordingRevision);
  await controls.getByRole("button", { name: "Terminer", exact: true }).click();
  await expect(controls.getByRole("button", { name: "Horizontal", exact: true })).toHaveAttribute(
    "aria-pressed",
    "false",
  );

  await expect(controls.getByRole("button", { name: "Boucle", exact: true })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await expect
    .poll(() =>
      page.evaluate(
        () => window.musart!.snapshot().project.pages[0]!.motion!.tracks[0]!.animations?.length,
      ),
    )
    .toBe(2);
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(dock).toHaveCount(1);
  await page.screenshot({ path: "artifacts/studio/motion-simple-timeline.png" });
  await page.getByRole("button", { name: "Compositions", exact: true }).click();
  const row = page.locator('.layer-row[data-layer-id="simple-subject"]');
  await row.locator(".group-chevron").click();
  const child = page.locator("[data-effect-animation]");
  await expect(child).toHaveCount(2);
  await child.last().getByRole("button").click();
  await expect(page.locator(".effect-motion[data-state=open] .animation-details")).toBeVisible();
  const edited = page.locator(".effect-motion[data-state=open] .animation-details");
  await edited.getByRole("textbox", { name: "Valeur", exact: true }).first().fill("6");
  await edited.getByRole("textbox", { name: "Valeur", exact: true }).first().press("Enter");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.musart!.snapshot().project.pages[0]!.motion!.tracks[0]!.animations!.at(-1)!.preset
            .channels[0]!.points[0]!.value,
      ),
    )
    .toBe(6);
  await expect(edited).toBeVisible();
  await expect(page.locator("body")).not.toHaveCSS("pointer-events", "none");
  await expect(page.locator("body")).not.toHaveAttribute("data-scroll-locked");
  await page.screenshot({ path: "artifacts/studio/effect-animation-child.png" });
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(entry).toBeVisible();
  const point = await entry.evaluate((node) => {
    const r = node.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  expect(
    await page.evaluate(
      ({ x, y }) => !!document.elementFromPoint(x, y)?.closest(".canvas-timeline-toggle"),
      point,
    ),
  ).toBe(true);
});
