import { test, expect, type Locator } from "@playwright/test";
import { mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { installReadbackProbe } from "./support/readback-probe";

const styles = ["ascii", "dither", "halftone", "cyanotype", "crt", "posterize"];
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem("musart.language")) localStorage.setItem("musart.language", "en");
    if (!localStorage.getItem("musart.theme")) localStorage.setItem("musart.theme", "light");
  });
});
async function animateDisclosure(trigger: Locator) {
  await expect(trigger).toBeEnabled();
  await trigger.scrollIntoViewIfNeeded();
  const content = trigger.locator("..").locator("..").locator(".site-faq-answer");
  const capture = content.evaluate(
    (element) =>
      new Promise<number[]>((resolve, reject) => {
        let timeout: ReturnType<typeof setTimeout> | undefined;
        const button = element
          .closest('[data-slot="accordion-item"]')!
          .querySelector('button[data-slot="accordion-trigger"]')!;
        button.addEventListener(
          "click",
          () => {
            timeout = setTimeout(() => {
              element.removeEventListener("transitionstart", start);
              reject(new Error("Accordion content did not animate"));
            }, 1200);
          },
          { once: true },
        );
        function start(event: Event) {
          if (
            (event as TransitionEvent).propertyName !== "grid-template-rows" ||
            event.target !== element
          )
            return;
          element.removeEventListener("transitionstart", start);
          const heights: number[] = [],
            began = performance.now();
          const sample = () => {
            heights.push(element.getBoundingClientRect().height);
            if (performance.now() - began < 350) requestAnimationFrame(sample);
            else {
              clearTimeout(timeout);
              resolve(heights);
            }
          };
          requestAnimationFrame(sample);
        }
        element.addEventListener("transitionstart", start);
      }),
  );
  await trigger.click();
  const heights = await capture;
  expect(new Set(heights.map(Math.round)).size).toBeGreaterThan(3);
  return heights;
}

test("public navigation stays centered and FAQ discloses real server content", async ({ page }) => {
  await page.goto("/");
  const nav = page.locator(".site-header > nav");
  const initial = await nav.boundingBox();
  const header = await page.locator(".site-header").boundingBox();
  expect(Math.abs(initial!.x + initial!.width / 2 - (header!.x + header!.width / 2))).toBeLessThan(
    1,
  );
  await page.getByRole("link", { name: "FAQ", exact: true }).first().click();
  await expect(page.locator("#faq h2")).toBeInViewport();
  const trigger = page.locator('#faq [data-slot="accordion-trigger"]').first();
  await animateDisclosure(trigger);
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  const answer = page.locator('#faq [data-slot="accordion-content"]').first();
  await expect.poll(async () => (await answer.boundingBox())!.height).toBeGreaterThan(35);
  await animateDisclosure(trigger);
  await expect.poll(async () => (await answer.boundingBox())!.height).toBeLessThan(1);
  await page.locator(".landing-page").evaluate((node) => {
    node.scrollTop = document.getElementById("faq")!.offsetTop + 24;
  });
  await expect
    .poll(async () => (await page.locator("#faq h2").boundingBox())!.y)
    .toBeCloseTo(124, 0);
  const before = await page.locator("#faq h2").boundingBox();
  await page.locator(".landing-page").evaluate((node) => {
    node.scrollTop += 120;
  });
  await expect
    .poll(async () => Math.abs((await page.locator("#faq h2").boundingBox())!.y - before!.y))
    .toBeLessThan(2);
  await page.getByRole("link", { name: "Free tools", exact: true }).first().click();
  await expect(page).toHaveURL(/\/tools\/?$/);
  const tools = await page.locator(".site-header > nav").boundingBox();
  expect(Math.abs(tools!.x + tools!.width / 2 - (initial!.x + initial!.width / 2))).toBeLessThan(1);
  await expect(page.locator('.site-header > nav [aria-current="page"]')).toHaveText("Free tools");
});

test("all six image tools lazily render genuine effects and download decoded images without readbacks", async ({
  page,
  context,
}) => {
  test.setTimeout(180000);
  await mkdir("artifacts/tools", { recursive: true });
  await installReadbackProbe(page);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const sample = resolve("apps/web/public/benchmark/06-boathouse-1.jpg");
  for (const style of styles) {
    await page.goto(`/tools/${style}-image-converter`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect(
      await page.evaluate(() =>
        performance
          .getEntriesByType("resource")
          .map((entry) => entry.name)
          .filter((name) => /ToolWorkspace|three\/webgpu|@react-three/.test(name)),
      ),
    ).toEqual([]);
    await expect(page.locator(".tool-converter")).toHaveAttribute("data-ready", "true");
    await page.locator("[data-tool-file]").setInputFiles(sample);
    const downloadButton = page.getByRole("button", { name: "Download image", exact: true });
    await expect(downloadButton).toBeEnabled({ timeout: 30000 });
    await expect(page.locator("canvas[data-tool-renderer]")).toBeVisible();
    await page.getByRole("combobox", { name: "Download format", exact: true }).click();
    await page.getByRole("option", { name: "WebP", exact: true }).click();
    const pending = page.waitForEvent("download");
    await downloadButton.click();
    const download = await pending;
    await download.saveAs(resolve(`artifacts/tools/${style}.webp`));
    expect((await readFile(resolve(`artifacts/tools/${style}.webp`))).length).toBeGreaterThan(1000);
    expect(await page.evaluate(() => window.__musartVideoReadbacks)).toMatchObject({
      gpu: 0,
      webgl: 0,
      canvas: 0,
      videoFrame: 0,
    });
    if (style === "ascii")
      await page.screenshot({ path: "artifacts/tools/ascii-desktop.png", fullPage: true });
    const inspection = await context.newPage();
    const bytes = await readFile(resolve(`artifacts/tools/${style}.webp`));
    const dimensions = await inspection.evaluate(async (encoded) => {
      const image = new Image();
      image.src = `data:image/webp;base64,${encoded}`;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(image, 0, 0);
      const pixels = ctx.getImageData(0, 0, image.width, image.height).data;
      const colors = new Set<number>();
      for (let i = 0; i < pixels.length; i += 16)
        colors.add((pixels[i]! << 16) | (pixels[i + 1]! << 8) | pixels[i + 2]!);
      return { width: image.width, height: image.height, colors: colors.size };
    }, bytes.toString("base64"));
    await inspection.close();
    await page.bringToFront();
    expect(dimensions.width).toBe(1280);
    expect(dimensions.height).toBe(960);
    expect(dimensions.colors).toBeGreaterThan(8);
  }
  expect(errors).toEqual([]);
});

test("all twelve public languages load from JSON, persist, and keep mobile navigation centered", async ({
  page,
}) => {
  test.setTimeout(90000);
  const hydrationErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" && /hydrat/i.test(message.text()))
      hydrationErrors.push(message.text());
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/tools");
  const languages = [
    ["de", "Deutsch"],
    ["es", "Español"],
    ["it", "Italiano"],
    ["pt", "Português"],
    ["nl", "Nederlands"],
    ["pl", "Polski"],
    ["ja", "日本語"],
    ["ko", "한국어"],
    ["zh", "中文"],
    ["ar", "العربية"],
    ["fr", "Français"],
    ["en", "English"],
  ];
  for (const [code, label] of languages) {
    const title = JSON.parse(await readFile(`apps/web/src/tools/content/${code}.json`, "utf8"))
      .hubTitle as string;
    const select = page.locator('.site-languages [role="combobox"]');
    await select.scrollIntoViewIfNeeded();
    await select.click();
    await expect(page.getByRole("option")).toHaveCount(12);
    await page.getByRole("option", { name: label, exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("lang", code!);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
    await expect(page.locator("html")).toHaveAttribute("dir", code === "ar" ? "rtl" : "ltr");
    expect(await page.evaluate(() => localStorage.getItem("musart.language"))).toBe(code);
  }
  await page.locator('.site-languages [role="combobox"]').click();
  await expect(page.getByRole("option", { name: "English", exact: true })).toBeFocused();
  await page.keyboard.press("Home");
  await expect(page.getByRole("option", { name: "English", exact: true })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("option", { name: "Français", exact: true })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("option", { name: "Deutsch", exact: true })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("html")).toHaveAttribute("lang", "de");
  // Preserve the chosen language on a true document navigation, not just a React update.
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "de");
  await expect(page.locator(".site-header > nav")).toBeVisible();
  const header = await page.locator(".site-header").boundingBox(),
    nav = await page.locator(".site-header > nav").boundingBox();
  expect(Math.abs(nav!.x + nav!.width / 2 - (header!.x + header!.width / 2))).toBeLessThan(1);
  expect(
    await page.locator(".public-page").evaluate((node) => node.scrollWidth <= node.clientWidth),
  ).toBe(true);
  expect(hydrationErrors).toEqual([]);
  await page.screenshot({ path: "artifacts/tools/hub-mobile-de.png" });
});

test("the local tool uses Three's real WebGL fallback, commits controls and exports the selected size", async ({
  page,
  context,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "gpu", { value: undefined, configurable: true }),
  );
  await installReadbackProbe(page);
  await page.goto("/tools/ascii-image-converter");
  await expect(page.locator(".tool-converter")).toHaveAttribute("data-ready", "true");
  await page
    .locator("[data-tool-file]")
    .setInputFiles(resolve("apps/web/public/benchmark/06-boathouse-1.jpg"));
  const download = page.getByRole("button", { name: "Download image", exact: true });
  await expect(download).toBeEnabled({ timeout: 30000 });
  await expect(page.locator("canvas[data-tool-renderer]")).toHaveAttribute(
    "data-tool-renderer",
    "webgl",
  );
  await page.getByRole("button", { name: "Advanced controls", exact: true }).click();
  const amount = page.getByRole("textbox", { name: "Amount", exact: true });
  await amount.fill("50");
  await amount.press("Escape");
  await expect(amount).toHaveValue("100");
  await amount.fill("50");
  await amount.press("Enter");
  await expect(amount).toHaveValue("50");
  await page.getByRole("combobox", { name: "Maximum edge", exact: true }).click();
  await page.getByRole("option", { name: "720 px", exact: true }).click();
  const pending = page.waitForEvent("download");
  await download.click();
  const file = await pending;
  await file.saveAs(resolve("artifacts/tools/ascii-fallback.png"));
  const data = await readFile(resolve("artifacts/tools/ascii-fallback.png"));
  const inspection = await context.newPage();
  const size = await inspection.evaluate(async (encoded) => {
    const image = new Image();
    image.src = `data:image/png;base64,${encoded}`;
    await image.decode();
    return [image.width, image.height];
  }, data.toString("base64"));
  expect(size).toEqual([720, 540]);
  await inspection.close();
  expect(await page.evaluate(() => window.__musartVideoReadbacks)).toMatchObject({
    gpu: 0,
    webgl: 0,
    canvas: 0,
    videoFrame: 0,
  });
});
