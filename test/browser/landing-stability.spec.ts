import { expect, test } from "@playwright/test";

test("writing survives incidental scroll and geometry replacement on repeated loads", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const state = { writing: false, rebuilt: false };
    Object.assign(window, { __landingStability: state });
    let changed = false;
    new MutationObserver((records) => {
      for (const { target, attributeName } of records) {
        if (!(target instanceof HTMLElement) || !target.closest(".landing-intro")) continue;
        if (attributeName === "data-ink-auto" && target.hasAttribute("data-ink-auto"))
          state.writing = true;
        if (attributeName === "data-vector-ready" && target.hasAttribute("data-vector-ready")) {
          if (changed) state.rebuilt = true;
          else {
            changed = true;
            // A font/layout scroll or resize must not cancel the entrance.
            target.style.maxInlineSize = "1060px";
            document.querySelector<HTMLElement>(".landing-page")!.scrollTop = 1;
          }
        }
      }
    }).observe(document, {
      subtree: true,
      attributes: true,
      attributeFilter: ["data-ink-auto", "data-vector-ready"],
    });
  });
  for (let repeat = 0; repeat < 3; repeat++) {
    if (repeat) await page.reload();
    else await page.goto("/");
    const stage = page.locator(".landing-intro .hero-type-stage");
    await expect(stage).not.toHaveAttribute("data-ink-pending");
    await expect(page.locator(".hero-mascot-stage")).toHaveAttribute("data-mascot-finished");
    expect(await page.evaluate(() => Reflect.get(window, "__landingStability"))).toEqual({
      writing: true,
      rebuilt: true,
    });
    await expect(stage.locator(".hero-glyph-overlay")).toHaveCount(1);
  }
});

test("navigation label positions stay fixed when the interface font arrives late", async ({
  page,
  context,
  baseURL,
}) => {
  await context.addCookies([{ name: "musart.language", value: "fr", url: baseURL! }]);
  let release!: () => void;
  const fontGate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(/inter-latin-wght-normal-[^/]+\.woff2/, async (route) => {
    await fontGate;
    await route.continue();
  });
  try {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    const links = page.locator(".site-header > nav a");
    await expect(links).toHaveCount(3);
    const positions = () =>
      links.evaluateAll((nodes) =>
        nodes.map((node) => {
          const rect = node.getBoundingClientRect();
          return { x: rect.x, width: rect.width };
        }),
      );
    const initial = await positions();
    release();
    await page.evaluate(() => document.fonts.ready);
    const loaded = await positions();
    for (let index = 0; index < initial.length; index++) {
      expect(loaded[index]!.x).toBeCloseTo(initial[index]!.x, 1);
      expect(loaded[index]!.width).toBeCloseTo(initial[index]!.width, 1);
    }
  } finally {
    release();
  }
});

test("leaving a preparing hero admits feature media and returning resumes writing", async ({
  page,
}) => {
  let release!: () => void;
  const fontGate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(/https:\/\/cdn\.fontshare\.com\/.*\.woff2/, async (route) => {
    await fontGate;
    await route.continue();
  });
  try {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    const stage = page.locator(".landing-intro .hero-type-stage");
    await expect(stage).toHaveAttribute("data-ink-pending");
    const clip = page.locator('[data-feature="timelapse"] video');
    await clip.scrollIntoViewIfNeeded();
    await expect(clip).toHaveAttribute("data-video-ready", "true");
    await expect(stage).toHaveAttribute("data-ink-pending");
    release();
    await page.locator(".landing-intro").scrollIntoViewIfNeeded();
    await expect(stage).toHaveAttribute("data-ink-auto");
    await expect(stage).not.toHaveAttribute("data-ink-pending");
    await expect(page.locator(".hero-mascot-stage")).toHaveAttribute("data-mascot-finished");
  } finally {
    release();
  }
});
