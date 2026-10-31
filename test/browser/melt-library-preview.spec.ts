import { expect, test } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { installReadbackProbe } from "./support/readback-probe";
test("MELT poster and live card/dialog previews use the new source with undistorted centered artwork", async ({
  page,
}) => {
  test.setTimeout(60000);
  await installReadbackProbe(page);
  await page.addInitScript(() => {
    localStorage.setItem("musart.onboarding.v1", JSON.stringify({ version: 1, completed: true }));
    localStorage.setItem("musart.language", "en");
  });
  await page.goto("/editor?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  await page.getByRole("button", { name: "Project menu", exact: true }).click();
  await page.locator(".library-navigation-item").filter({ hasText: "Templates" }).first().click();
  await page.getByRole("searchbox").fill("Melt Mascot");
  const card = page.locator(".template-card-entry").filter({ hasText: "Melt Mascot" });
  await expect(card).toBeVisible();
  const poster = card.locator(".motion-template-preview > img");
  await expect(poster).toHaveAttribute("src", /melt-lettering-2/);
  await poster.evaluate((image) => (image as HTMLImageElement).decode());
  await mkdir("artifacts/melt-library", { recursive: true });
  const art = (await card.locator(".template-artwork").boundingBox())!,
    caption = (await card.locator(".library-card-caption").boundingBox())!;
  expect(caption.y).toBeGreaterThanOrEqual(art.y + art.height - 1);
  await expect(card.locator(".template-artwork")).toHaveCSS(
    "background-color",
    "rgb(255, 255, 255)",
  );
  await card.screenshot({ path: "artifacts/melt-library/poster-card.png" });
  await card.locator(".template-artwork").hover();
  const live = card.locator(".motion-template-preview");
  await expect(live).toHaveAttribute("data-preview-status", "playing", { timeout: 20000 });
  await expect
    .poll(async () =>
      Number(
        await live.locator(".motion-template-preview-canvas").getAttribute("data-preview-time"),
      ),
    )
    .toBeGreaterThan(2.4);
  await live.screenshot({ path: "artifacts/melt-library/live-card.png" });
  await card.getByRole("button", { name: "Preview Melt Mascot", exact: true }).click();
  const dialog = page
    .getByRole("dialog")
    .filter({ has: page.getByRole("heading", { name: "Melt Mascot", exact: true }) });
  await expect(dialog).toBeVisible();
  const dialogPreview = dialog.locator(".motion-template-preview");
  await expect(dialogPreview).toHaveAttribute("data-preview-status", "playing", { timeout: 20000 });
  await expect
    .poll(async () =>
      Number(
        await dialogPreview
          .locator(".motion-template-preview-canvas")
          .getAttribute("data-preview-time"),
      ),
    )
    .toBeGreaterThan(2.4);
  await dialogPreview.screenshot({ path: "artifacts/melt-library/live-dialog.png" });
  await expect(dialogPreview.locator(".motion-preview-hint")).toHaveCount(0);
  const witness = JSON.parse(
    execFileSync(
      "python3",
      [
        "-c",
        [
          "from PIL import Image",
          "import json",
          "result={}",
          "for name in ['live-card','live-dialog']:",
          " im=Image.open(f'artifacts/melt-library/{name}.png').convert('RGB'); points=[]",
          " for y in range(im.height):",
          "  for x in range(int(im.width*.18)):",
          "   r,g,b=im.getpixel((x,y))",
          "   if abs(r-139)<8 and abs(g-92)<8 and abs(b-246)<8: points.append((x,y))",
          " assert points, name",
          " xs,ys=zip(*points); w=max(xs)-min(xs)+1; h=max(ys)-min(ys)+1",
          " result[name]={'width':w,'height':h,'ratio':h/w,'centerY':(max(ys)+min(ys))/2/im.height}",
          "print(json.dumps(result))",
        ].join("\n"),
      ],
      { encoding: "utf8" },
    ),
  );
  for (const result of Object.values(witness) as { ratio: number; centerY: number }[]) {
    expect(result.ratio).toBeGreaterThan(0.85);
    expect(result.ratio).toBeLessThan(1.15);
    expect(result.centerY).toBeGreaterThan(0.42);
    expect(result.centerY).toBeLessThan(0.58);
  }
  expect(await page.evaluate(() => window.__musartVideoReadbacks)).toMatchObject({
    gpu: 0,
    webgl: 0,
    canvas: 0,
  });
  await writeFile("artifacts/melt-library/aspect.json", JSON.stringify(witness, null, 2));
});

declare global {
  interface Window {
    __disposeTouchTemplates?: () => void;
  }
}
test("touch library cards autoplay without hover and hand playback to the dialog", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  try {
    await installReadbackProbe(page);
    await page.addInitScript(() => {
      localStorage.setItem("musart.onboarding.v1", JSON.stringify({ version: 1, completed: true }));
      localStorage.setItem("musart.language", "en");
    });
    await page.goto("/editor?automation=1");
    await page.waitForFunction(() => Boolean(window.musart));
    await page.getByRole("button", { name: "Project menu", exact: true }).click();
    await page.locator('.mobile-library-nav [data-navigation-value="templates"]').click();
    await page.getByRole("searchbox").fill("Melt Mascot");
    const card = page.locator(".template-card-entry").filter({ hasText: "Melt Mascot" });
    await card.scrollIntoViewIfNeeded();
    await expect(card.locator(".motion-template-preview")).toHaveAttribute(
      "data-preview-status",
      "playing",
      { timeout: 20000 },
    );
    await card.getByRole("button", { name: "Preview Melt Mascot", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.locator(".motion-template-preview")).toHaveAttribute(
      "data-preview-status",
      "playing",
      { timeout: 20000 },
    );
    await expect(dialog.locator(".motion-preview-hint")).toHaveCount(0);
    await expect(
      page.locator('.motion-template-preview[data-preview-status="playing"]'),
    ).toHaveCount(1);
    expect(await page.evaluate(() => window.__musartVideoReadbacks)).toMatchObject({
      gpu: 0,
      webgl: 0,
      canvas: 0,
    });
  } finally {
    await context.close();
  }
});
