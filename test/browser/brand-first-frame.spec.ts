import { expect, test } from "@playwright/test";

test("header and footer paint the native transparent image before acquiring hover animation", async ({
  page,
}) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let requests = 0;
  await page.route(/\/MeltLogo-[^/]+\.js$/, async (route) => {
    requests++;
    await gate;
    await route.continue();
  });
  await page.goto("/");
  const header = page.locator(".landing-brand .melt-mark");
  const image = header.locator("img");
  await expect(image).toHaveJSProperty("naturalWidth", 256);
  await expect(image).toHaveCSS("opacity", "1");
  expect(requests).toBe(0);
  await expect(header.locator("svg")).toHaveCount(0);
  // Native asset preparation is inspected outside any production rendering interval.
  expect(
    await image.evaluate((node: HTMLImageElement) => {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = node.naturalWidth;
      const context = canvas.getContext("2d")!;
      context.drawImage(node, 0, 0);
      return [
        context.getImageData(0, 0, 1, 1).data[3],
        context.getImageData(128, 128, 1, 1).data[3],
      ];
    }),
  ).toEqual([0, 255]);
  await page.locator(".landing-brand").hover();
  await expect.poll(() => requests).toBe(1);
  await expect(image).toHaveCSS("opacity", "1");
  release();
  await expect(header).toHaveAttribute("data-ready", "true");
  await expect(image).toHaveCSS("opacity", "0");
  const body = header.locator('[data-mascot-part="body"]');
  const before = await body.getAttribute("d");
  await expect.poll(() => body.getAttribute("d")).not.toBe(before);
  await page.mouse.move(0, 0);
  await expect(image).toHaveCSS("opacity", "1");
  await expect(header.locator("svg")).toHaveCount(0);
  const footer = page.locator(".landing-footer-brand .melt-mark");
  await footer.scrollIntoViewIfNeeded();
  await expect(footer.locator("img")).toHaveJSProperty("naturalWidth", 256);
  await expect(footer.locator("svg")).toHaveCount(0);
  await page.locator(".landing-footer-brand").hover();
  await expect(footer).toHaveAttribute("data-ready", "true");
  await page.mouse.move(0, 0);
  await expect(footer.locator("svg")).toHaveCount(0);
});

test("startup retains its image while the SVG chunk is pending, then animates without a blank frame", async ({
  page,
}) => {
  let releaseSvg!: () => void;
  let releaseEditor!: () => void;
  const svg = new Promise<void>((resolve) => {
    releaseSvg = resolve;
  });
  const editor = new Promise<void>((resolve) => {
    releaseEditor = resolve;
  });
  await page.route(/\/MeltLogo-[^/]+\.js$/, async (route) => {
    await svg;
    await route.continue();
  });
  await page.route(/\/App-[^/]+\.js$/, async (route) => {
    await editor;
    await route.abort();
  });
  try {
    await page.goto("/editor", { waitUntil: "domcontentloaded" });
    const mark = page.locator(".studio-loading .melt-mark");
    await expect(mark).toBeVisible();
    await expect(mark.locator("img")).toHaveJSProperty("naturalWidth", 256);
    await expect(mark.locator("img")).toHaveCSS("opacity", "1");
    await expect(mark.locator("[data-mascot-part]")).toHaveCount(0);
    releaseSvg();
    await expect(mark).toHaveAttribute("data-ready", "true");
    const body = mark.locator('[data-mascot-part="body"]');
    const before = await body.getAttribute("d");
    await expect.poll(() => body.getAttribute("d")).not.toBe(before);
  } finally {
    releaseSvg();
    releaseEditor();
    await page.goto("about:blank");
  }
});
