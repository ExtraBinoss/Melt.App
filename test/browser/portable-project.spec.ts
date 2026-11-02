import { expect, test } from "@playwright/test";
import { createLayer, createPage, createProject } from "@musart/core";
import { readFile } from "node:fs/promises";
import { unzipSync, strFromU8 } from "fflate";

test("native .musart and ZIP exports contain binary originals and reopen image/video projects", async ({
  page,
}, info) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem("musart.editor-tutorial.v1", "done");
    localStorage.setItem("musart.language", "en");
    localStorage.setItem("musart.onboarding.v1", JSON.stringify({ version: 1, completed: true }));
  });
  await page.goto("/editor?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  const png =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a0n0AAAAASUVORK5CYII=";
  const assets = Object.fromEntries(
    [0, 1].map((i) => [
      `photo-${i}`,
      {
        id: `photo-${i}`,
        name: `Photo ${i}`,
        mime: "image/png",
        width: 1,
        height: 1,
        dataUrl: png,
      },
    ]),
  );
  await page.evaluate(
    (project) => window.musart!.load(project),
    createProject({
      name: "Portable originals",
      assets,
      pages: [
        createPage({
          width: 640,
          height: 360,
          layers: [createLayer("image", { assetId: "photo-0", width: 40, height: 40 })],
        }),
      ],
    }),
  );
  await page
    .locator('input[type="file"][accept="image/*,video/*,audio/*,.svg"]')
    .setInputFiles("apps/web/public/templates/motion/media/flower.mp4");
  await expect
    .poll(() =>
      page.evaluate(() =>
        Object.values(window.musart!.snapshot().project.assets).some((a) => a.kind === "video"),
      ),
    )
    .toBe(true);
  const before = await page.evaluate(() => window.musart!.snapshot().project);
  await expect(page.locator('canvas[data-renderer-ready="true"]')).toBeVisible();
  let zipPath = "";
  for (const extension of ["musart", "zip"] as const) {
    await page.getByRole("button", { name: "Project actions", exact: true }).click();
    const downloadPromise = page.waitForEvent("download");
    await page
      .getByRole("button", {
        name: extension === "musart" ? "Download .musart project" : "Download project ZIP",
        exact: true,
      })
      .click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe(`Portable originals.${extension}`);
    const path = info.outputPath(`project.${extension}`);
    await download.saveAs(path);
    const files = unzipSync(await readFile(path));
    expect(Object.keys(files)).toHaveLength(3);
    const document = strFromU8(files["project.json"]!);
    expect(document).not.toContain("base64");
    expect(document).toContain("assets/");
    const videoPath = Object.keys(files).find((p) => p.endsWith(".mp4"))!;
    expect(Buffer.from(files[videoPath]!)).toEqual(
      await readFile("apps/web/public/templates/motion/media/flower.mp4"),
    );
    if (extension === "zip") zipPath = path;
    await page.keyboard.press("Escape");
  }
  await page.getByRole("button", { name: "Project actions", exact: true }).click();
  await page.getByRole("button", { name: "Projects", exact: true }).click();
  await page.getByLabel("Import .musart", { exact: true }).setInputFiles(zipPath);
  await expect
    .poll(() => page.evaluate(() => window.musart!.session().projectId))
    .not.toBe(before.id);
  await expect(page.locator('canvas[data-renderer-ready="true"]')).toBeVisible();
  const after = await page.evaluate(() => window.musart!.snapshot().project);
  expect(after.assets).toEqual(before.assets);
  expect(after.pages).toEqual(before.pages);
  // Navigation intentionally drops the opt-in automation query; retain it only for this reload probe.
  await page.evaluate(() => {
    const url = new URL(location.href);
    url.searchParams.set("automation", "1");
    history.replaceState(null, "", url);
  });
  await page.reload();
  await page.waitForFunction((id) => window.musart?.session().projectId === id, after.id);
  await expect(page.locator('canvas[data-renderer-ready="true"]')).toBeVisible();
  expect(await page.evaluate(() => window.musart!.snapshot().project.assets)).toEqual(
    before.assets,
  );
  expect(errors).toEqual([]);
});
