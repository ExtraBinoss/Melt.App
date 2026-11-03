import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { supportedLocales } from "../../apps/web/src/state/i18n/locales";
import { brand } from "../../apps/web/src/ui/brand/config";
import en from "../../apps/web/src/components/onboarding/tutorial/locales/en.json" with { type: "json" };
import fr from "../../apps/web/src/components/onboarding/tutorial/locales/fr.json" with { type: "json" };

const branded = (text: string) => text.replaceAll("{{brandName}}", brand.name);

for (const { code } of supportedLocales) {
  test(`tutorial invitation, controls, project and exit are localized in ${code}`, async ({
    page,
  }) => {
    const copy: typeof en = JSON.parse(
      readFileSync(
        new URL(
          `../../apps/web/src/components/onboarding/tutorial/locales/${code}.json`,
          import.meta.url,
        ),
        "utf8",
      ),
    );
    await page.addInitScript((language) => localStorage.setItem("musart.language", language), code);
    await page.goto("/editor?automation=1");
    await expect(page.getByRole("heading", { name: copy.invite, exact: true })).toBeVisible({
      timeout: 30000,
    });
    await expect(page.locator(".tutorial-invite")).toHaveAttribute(
      "dir",
      code === "ar" ? "rtl" : "ltr",
    );
    await expect(page.getByRole("button", { name: copy.no, exact: true })).toBeVisible();
    await page.getByRole("button", { name: copy.yes, exact: true }).click();
    const guide = page.getByRole("region", { name: branded(copy.region), exact: true });
    await expect(
      guide.getByRole("heading", { name: copy.steps.canvas.title, exact: true }),
    ).toBeVisible({ timeout: 30000 });
    await expect(guide).toHaveAttribute("dir", code === "ar" ? "rtl" : "ltr");
    const project = await page.evaluate(() => {
      const snapshot = window.musart!.snapshot();
      return {
        name: snapshot.project.name,
        layers: snapshot.project.pages[0]!.layers.map((layer) => layer.name),
      };
    });
    expect(project.name).toBe(branded(copy.project.name));
    expect(project.layers).toEqual([
      copy.project.mountains,
      copy.project.lake,
      copy.project.forest,
    ]);
    await guide.getByRole("button", { name: copy.next, exact: true }).click();
    await expect(
      guide.getByRole("heading", { name: copy.steps.tools.title, exact: true }),
    ).toBeVisible();
    await expect(guide.locator('[data-slot="kbd"]').last()).toHaveText(copy.controls.wheel);
    await expect(guide.locator('[data-slot="kbd"]').last()).toBeVisible();
    await page.screenshot({ path: `artifacts/tutorial/locales/${code}.png` });
    for (const title of [
      copy.steps.properties.title,
      copy.steps.layers.title,
      copy.steps.effectMenu.title,
    ]) {
      await guide.getByRole("button", { name: copy.next, exact: true }).click();
      await expect(guide.getByRole("heading", { name: title, exact: true })).toBeVisible();
    }
    await expect
      .poll(async () => {
        const box = await guide.locator(".tutorial-mascot").boundingBox();
        const target = await page.locator(".layer-create-actions").boundingBox();
        const card = await guide.boundingBox();
        const viewport = page.viewportSize()!;
        return (
          !!box &&
          !!target &&
          !!card &&
          box.x >= 0 &&
          box.y >= 0 &&
          box.x + box.width <= viewport.width &&
          box.y + box.height <= viewport.height &&
          (card.x + card.width / 2 < target.x + target.width / 2
            ? Math.abs(box.x + box.width - target.x) < 28
            : Math.abs(box.x - target.x - target.width) < 28)
        );
      })
      .toBe(true);
    await page.screenshot({ path: `artifacts/tutorial/locales/${code}-effect-menu.png` });
    await guide.getByRole("button", { name: copy.exit, exact: true }).click();
    await expect(page.getByRole("heading", { name: copy.leave, exact: true })).toBeVisible();
    await page.getByRole("button", { name: copy.stay, exact: true }).click();
    await expect(
      guide.getByRole("heading", { name: copy.steps.effectMenu.title, exact: true }),
    ).toBeVisible();
    await guide.getByRole("button", { name: copy.exit, exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: copy.exit, exact: true }).click();
    await expect(guide).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem("musart.editor-tutorial.v1"))).toBe(
      "done",
    );
  });
}

test("French tutorial follows stable step IDs through Dither, Motion, timeline and real video export", async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem("musart.language", "fr"));
  await page.goto("/editor?automation=1");
  await page.getByRole("button", { name: fr.yes, exact: true }).click({ timeout: 30000 });
  const guide = page.getByRole("region", { name: branded(fr.region), exact: true });
  await expect(guide.getByRole("heading", { name: fr.steps.canvas.title })).toBeVisible({
    timeout: 30000,
  });
  await guide
    .getByRole("button", { name: fr.next, exact: true })
    .evaluate((button: HTMLButtonElement) => {
      for (let i = 0; i < 15; i++) button.click();
    });
  await expect(guide.getByRole("heading", { name: fr.steps.play.title, exact: true })).toBeVisible({
    timeout: 20000,
  });
  await expect(page.locator('[data-motion-pinned="true"]')).toBeVisible();
  for (const title of [fr.steps.export.title, fr.steps.exportWindow.title, fr.steps.render.title]) {
    await guide.getByRole("button", { name: fr.next, exact: true }).click();
    await expect(guide.getByRole("heading", { name: title, exact: true })).toBeVisible();
  }
  const download = page.waitForEvent("download");
  await guide.getByRole("button", { name: fr.next, exact: true }).click();
  await expect(guide.getByRole("heading", { name: fr.steps.ready.title, exact: true })).toBeVisible(
    { timeout: 10000 },
  );
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/\.(mp4|webm)$/);
  await file.saveAs("artifacts/tutorial/locales/practice-fr.mp4");
  await guide.getByRole("button", { name: fr.finish, exact: true }).click();
  await expect(guide).toHaveCount(0);
});
