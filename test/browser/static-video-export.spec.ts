import { expect, test } from "@playwright/test";
import { createLayer, createPage, createProject } from "@musart/core";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { installReadbackProbe } from "./support/readback-probe";
import type * as StaticVideo from "./support/static-video";

test("Static exports a real still video while empty PNG Advanced stays hidden", async ({
  page,
  browser,
}) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await installReadbackProbe(page);
  await page.addInitScript(() => {
    localStorage.setItem("musart.language", "en");
    localStorage.setItem("musart.editor-tutorial.v1", "done");
    localStorage.setItem("musart.onboarding.v1", JSON.stringify({ version: 1, completed: true }));
  });
  await page.goto("/editor?automation=1");
  await page.waitForFunction(() => !!window.musart);
  const project = createProject({
    pages: [
      createPage({
        id: "still",
        name: "Still",
        width: 64,
        height: 48,
        background: "#0033ff",
        layers: [createLayer("rectangle", { x: 8, y: 8, width: 16, height: 16, fill: "#ff0000" })],
      }),
    ],
  });
  await page.evaluate((project) => window.musart!.load(project), project);
  const before = await page.evaluate(() => JSON.stringify(window.musart!.snapshot().project));
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Advanced", exact: true })).toHaveCount(0);
  await dialog.getByRole("radio", { name: "Video", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Advanced", exact: true })).toBeVisible();
  const duration = dialog.getByRole("textbox", { name: "Video duration", exact: true });
  await duration.fill("0.5");
  await duration.press("Enter");
  await expect(dialog.locator('[data-preview-ready="true"]')).toBeVisible({ timeout: 30000 });
  const downloaded = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Export video", exact: true }).click();
  const download = await downloaded;
  expect(await download.failure()).toBeNull();
  const bytes = await readFile((await download.path())!);
  const encoded = `data:video/${download.suggestedFilename().endsWith("mp4") ? "mp4" : "webm"};base64,${bytes.toString("base64")}`;
  expect(await page.evaluate(() => JSON.stringify(window.musart!.snapshot().project))).toBe(before);
  await expect(dialog.getByRole("button", { name: "Export video", exact: true })).toBeEnabled();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  const moduleUrl = `/@fs${resolve("test/browser/support/static-video.ts")}`;
  const fallback = await page.evaluate(async (url) => {
    const module = (await import(url)) as typeof StaticVideo;
    return module.exportStaticFallback();
  }, moduleUrl);
  expect(fallback).toMatchObject({ unchanged: true, frames: 6, audio: null });
  expect(await page.evaluate(() => window.__musartVideoReadbacks)).toMatchObject({
    gpu: 0,
    webgl: 0,
    canvas: 0,
    videoFrame: 0,
  });
  const inspector = await browser.newPage();
  await inspector.route("**/video-inspection", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><title>Video inspection</title>",
    }),
  );
  try {
    await inspector.goto(new URL("/video-inspection", page.url()).href);
    for (const [url, count] of [
      [encoded, 15],
      [fallback.encoded, 6],
    ] as const) {
      const result = await inspector.evaluate(
        async ({ url, moduleUrl }) => {
          const module = (await import(moduleUrl)) as typeof StaticVideo;
          return module.inspectStaticVideo(url);
        },
        { url, moduleUrl },
      );
      expect(result).toMatchObject({ width: 64, height: 48, audio: false });
      expect(result.duration).toBeCloseTo(0.5, 2);
      expect(result.frames).toHaveLength(count);
      for (const frame of result.frames) {
        expect(frame.red).toBeGreaterThan(200);
        expect(frame.x).toBeCloseTo(15.5, 0);
        expect(frame.y).toBeCloseTo(15.5, 0);
      }
    }
  } finally {
    await inspector.close();
  }
  expect(errors).toEqual([]);
});
