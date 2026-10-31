import { expect, test, type Page } from "@playwright/test";
import { applyMotionFrame, compileMotion, evaluateMotion } from "@musart/core";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { installReadbackProbe } from "./support/readback-probe";

async function counters(page: Page) {
  return page.evaluate(() => ({
    revision: window.musart!.snapshot().revision,
    commits: [
      ".musart-app",
      ".inspector",
      ".canvas-area",
      ".editor-canvas",
      ".editor-gpu-scene",
    ].map((selector) => document.querySelector<HTMLElement>(selector)?.dataset.reactRenders),
  }));
}
async function ready(page: Page) {
  await page.waitForFunction(() => {
    const c = document.querySelector<HTMLCanvasElement>(".canvas-artboard canvas");
    return (
      c?.dataset.rendererReady === "true" && c.dataset.sceneRevision === c.dataset.renderedRevision
    );
  });
}

test("native font samples decode, aliases retain MELT, another font retains tall glyphs, cancellation and undo restore the exact pose", async ({
  page,
}) => {
  test.setTimeout(90000);
  await installReadbackProbe(page);
  await page.addInitScript(() => {
    localStorage.setItem("musart.onboarding.v1", JSON.stringify({ version: 1, completed: true }));
    localStorage.setItem("musart.language", "en");
  });
  await page.goto("/editor?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  const { project } = JSON.parse(
    await readFile("apps/web/public/templates/motion/morphing-type.json", "utf8"),
  );
  const program = compileMotion(project, { compositionId: project.pages[0].id });
  const peak = structuredClone(
    applyMotionFrame(program, evaluateMotion(program, { value: 5, rate: 2 })),
  );
  delete peak.motion;
  project.pages = [peak];
  await page.evaluate((project) => {
    window.musart!.load(project);
    window.musart!.select(["melt-wordmark"]);
  }, project);
  await ready(page);
  await mkdir("artifacts/font-morph", { recursive: true });
  const canvas = page.locator(".canvas-artboard canvas");
  async function capture(name: string) {
    const png = await canvas.screenshot({
      style: "[data-radix-popper-content-wrapper] { opacity: 0 !important; }",
    });
    await writeFile(`artifacts/font-morph/${name}.png`, png);
    return png;
  }
  const original = await capture("original");
  const trigger = page.getByRole("combobox", { name: "Font", exact: true });
  const row = (name: string) => page.getByRole("option", { name, exact: true });
  await trigger.click();
  for (const font of ["Inter", "Space Grotesk", "Arimo", "Tinos"])
    await expect(row(font).locator("[data-font-preview-state]")).toHaveAttribute(
      "data-font-preview-state",
      "ready",
    );
  const before = await counters(page);
  await row("Inter").hover();
  await expect(trigger).toHaveAttribute("data-font-render-family", "Inter");
  await expect(trigger).toHaveAttribute("data-font-render-status", "ready");
  expect(await capture("inter-alias")).toEqual(original);
  expect(await counters(page)).toEqual(before);
  await row("Tinos").hover();
  await expect(trigger).toHaveAttribute("data-font-render-family", "Tinos");
  await expect(trigger).toHaveAttribute("data-font-render-status", "ready");
  const serif = await capture("tinos-preview");
  expect(serif).not.toEqual(original);
  expect(await counters(page)).toEqual(before);
  await expect(page.getByText(/is ready/)).toHaveCount(0);
  await page.keyboard.press("Escape");
  await ready(page);
  expect(await capture("cancelled")).toEqual(original);
  await trigger.click();
  await row("Tinos").click();
  await expect(trigger).toHaveAttribute("data-font-render-status", "ready");
  await ready(page);
  expect(await capture("tinos-committed")).toEqual(serif);
  expect((await counters(page)).revision).toBe(before.revision + 1);
  for (const forceWebGL of [false, true]) {
    const data = await page.evaluate(
      (forceWebGL) => window.musart!.render({ scale: 0.25, forceWebGL }),
      forceWebGL,
    );
    await writeFile(
      `artifacts/font-morph/tinos-${forceWebGL ? "webgl" : "webgpu"}.png`,
      Buffer.from(data.split(",")[1]!, "base64"),
    );
  }
  const difference = Number(
    execFileSync(
      "python3",
      [
        "-c",
        "from PIL import Image,ImageChops,ImageStat; a=Image.open('artifacts/font-morph/tinos-webgpu.png').convert('RGB'); b=Image.open('artifacts/font-morph/tinos-webgl.png').convert('RGB'); print(sum(ImageStat.Stat(ImageChops.difference(a,b)).mean)/3)",
      ],
      { encoding: "utf8" },
    ),
  );
  expect(difference).toBeLessThan(1);
  await page.evaluate(() => window.musart!.undo());
  await ready(page);
  expect(await capture("undo")).toEqual(original);
  expect(await page.evaluate(() => window.__musartVideoReadbacks)).toMatchObject({
    gpu: 0,
    webgl: 0,
    canvas: 0,
  });
});
