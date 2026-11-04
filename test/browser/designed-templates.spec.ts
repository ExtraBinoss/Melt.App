import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import type { Project } from "@musart/core";
import { installReadbackProbe } from "./support/readback-probe";

const retained = [
  "Départ Studio",
  "Second Skin",
  "Terminal Signal",
  "Angel.exe",
  "Cornell Box",
  "Bloom Windows",
  "Mascotte Melt",
  "Too Hot to Haunt",
];
const retired = [
  "Orbit Study",
  "Paper Motion",
  "Colorfield",
  "Atlas des transitions",
  "AFTERHOURS",
  "In Bloom",
  "Laboratoire Motion",
  "Sound Playground",
];

test("curated gallery loads per-template posters, omits retired designs and persists an independent project", async ({
  page,
}) => {
  test.setTimeout(60000);
  const source = JSON.parse(
    await readFile("apps/web/public/templates/motion/morphing-type/morphing-type.json", "utf8"),
  ) as { project: Project };
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await installReadbackProbe(page);
  await page.addInitScript(() => {
    localStorage.setItem("musart.onboarding.v1", JSON.stringify({ version: 1, completed: true }));
    localStorage.setItem("musart.language", "fr");
  });
  await page.goto("/editor?automation=1");
  await page.waitForFunction(() => !!window.musart);
  await page.getByRole("button", { name: "Menu du projet", exact: true }).click();
  await page.locator(".library-navigation-item").filter({ hasText: "Templates" }).click();
  const gallery = page.locator(".project-dashboard");
  for (const name of retained)
    await expect(
      gallery.getByRole("button", { name: `Créer depuis ${name}`, exact: true }),
    ).toBeVisible();
  for (const name of retired)
    await expect(
      gallery.getByRole("button", { name: new RegExp(`Créer depuis ${name}`) }),
    ).toHaveCount(0);
  const posters = gallery.locator('.template-grid img[src*="/templates/"]');
  await expect(posters).toHaveCount(retained.length);
  await expect
    .poll(() =>
      posters.evaluateAll((images) =>
        images.every(
          (node) => node instanceof HTMLImageElement && node.complete && node.naturalWidth > 0,
        ),
      ),
    )
    .toBe(true);
  const use = gallery.getByRole("button", { name: "Créer depuis Mascotte Melt", exact: true });
  await use.click();
  await expect(gallery).toHaveCount(0);
  await expect
    .poll(() => page.evaluate(() => window.musart!.snapshot().project.name))
    .toBe("Melt Mascot");
  const project = await page.evaluate(() => window.musart!.snapshot().project);
  expect(project.id).not.toBe(source.project.id);
  expect(project.pages).toEqual(source.project.pages);
  await expect(page.locator('canvas[data-renderer-ready="true"]').first()).toBeVisible();
  await page.evaluate(() => window.musart!.save());
  await page.goto(`/editor?project=${project.id}&automation=1`);
  await page.waitForFunction((id) => window.musart?.session().projectId === id, project.id);
  expect((await page.evaluate(() => window.musart!.snapshot().project)).pages).toEqual(
    project.pages,
  );
  expect(await page.evaluate(() => window.__musartVideoReadbacks)).toMatchObject({
    gpu: 0,
    webgl: 0,
    canvas: 0,
    videoFrame: 0,
  });
  expect(errors).toEqual([]);
});
