import { expect, test } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { photographicEffect } from "./support/photographic-effect";
import type {} from "../../apps/web/src/services/automation/automation";

test("radial handles offer delayed help, forgiving grab targets and the normal themed switch", async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.addInitScript(() => {
    localStorage.setItem("musart.language", "fr");
    localStorage.setItem("musart.theme", "dark");
  });
  const d = await photographicEffect(page, "blur", false);
  const snapshot = () =>
    page.evaluate(() => {
      const state = window.musart!.snapshot();
      return { revision: state.revision, effect: state.project.pages[0]!.layers[0]!.effects[0]! };
    });
  try {
    await d.load({ settings: { protect: true, protectedRadius: 32, feather: 16 } });
    await page.evaluate(() => window.musart!.select(["blur-image"]));
    const original = await snapshot();
    await page.locator(`[data-attachment-effect-id="${original.effect.id}"]`).first().click();
    const popover = page.locator(".layer-attachment-popover");
    const toggle = popover.getByRole("switch", { name: "Protéger le centre" });
    await expect(toggle).toBeVisible();
    const colors = await toggle.evaluate((element) => {
      const reference = element.cloneNode(true) as HTMLElement;
      reference.style.position = "fixed";
      reference.style.left = "-9999px";
      document.body.append(reference);
      try {
        const actual = getComputedStyle(element),
          normal = getComputedStyle(reference);
        return {
          actual: [actual.backgroundColor, actual.borderColor],
          normal: [normal.backgroundColor, normal.borderColor],
        };
      } finally {
        reference.remove();
      }
    });
    expect(colors.actual).toEqual(colors.normal);
    const timings = [];
    for (const [handle, copy] of [
      ["center", "déplacer le centre"],
      ["innerRadius", "zone protégée"],
      ["radius", "zones nette et floue"],
    ] as const) {
      await page.mouse.move(50, 50);
      await expect(
        page.locator('[data-slot="tooltip-content"][data-state="delayed-open"]'),
      ).toHaveCount(0);
      const target = page.locator(`.effect-gizmo [data-handle="${handle}"]`);
      const probe = await target.evaluateHandle((element) => {
        let start = 0,
          opened = 0,
          early = false;
        let timer = 0;
        const content = () =>
          document.querySelector('[data-slot="tooltip-content"][data-state="delayed-open"]');
        const enter = () => {
          if (start) return;
          start = performance.now();
          timer = window.setTimeout(() => {
            early = !!content();
          }, 350);
        };
        const observer = new MutationObserver(() => {
          if (start && !opened && content()) opened = performance.now();
        });
        observer.observe(document.body, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ["data-state"],
        });
        element.addEventListener("pointermove", enter);
        return {
          read: () => ({ elapsed: opened - start, early }),
          stop: () => {
            clearTimeout(timer);
            observer.disconnect();
            element.removeEventListener("pointermove", enter);
          },
        };
      });
      try {
        const box = (await target.boundingBox())!;
        expect(box.width).toBeCloseTo(28, 1);
        const visible = (await page.locator(`[data-handle-visual="${handle}"]`).boundingBox())!;
        // The visible 12px fill retains its existing 1.5px outline.
        expect(visible.width).toBeCloseTo(13.5, 1);
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 10);
        const tip = page.locator('[data-slot="tooltip-content"][data-state="delayed-open"]');
        await expect(tip).toBeVisible();
        await expect(tip).toContainText(copy);
        const timing = await probe.evaluate((state) => state.read());
        expect(timing.early).toBe(false);
        expect(timing.elapsed).toBeGreaterThanOrEqual(480);
        timings.push({ handle, ...timing });
        const before = await snapshot();
        await page.mouse.down();
        await expect(
          page.locator('[data-slot="tooltip-content"][data-state="delayed-open"]'),
        ).toHaveCount(0);
        await page.mouse.move(box.x + box.width / 2 + 12, box.y + box.height / 2 + 10, {
          steps: 4,
        });
        expect(await snapshot()).toEqual(before);
        await page.mouse.up();
        const changed = await snapshot();
        expect(changed.revision).toBe(before.revision + 1);
        if (handle === "center")
          expect(changed.effect.settings!.centerX).toBeCloseTo(0.5 + 12 / 192, 3);
        else if (handle === "innerRadius")
          expect(changed.effect.settings!.protectedRadius).toBeCloseTo(44, 3);
        else expect(changed.effect.settings!.feather).toBeCloseTo(28, 3);
        await expect(popover).toBeVisible();
        await expect(target).toBeVisible();
        await page.evaluate(() => window.musart!.undo());
        expect((await snapshot()).effect).toEqual(original.effect);
      } finally {
        await probe.evaluate((state) => state.stop());
        await probe.dispose();
      }
    }
    await mkdir("artifacts/gizmo-help", { recursive: true });
    await page.screenshot({ path: "artifacts/gizmo-help/controls.png" });
    await writeFile(
      "artifacts/gizmo-help/native.json",
      JSON.stringify({ colors, timings, errors: d.errors }, null, 2),
    );
    expect(d.errors).toEqual([]);
    const board = (await page.locator(".effect-gizmo").boundingBox())!;
    await page.mouse.click(board.x + 8, board.y + 8);
    await expect(popover).toBeHidden();
    await expect(page.locator(".effect-gizmo")).toHaveCount(0);
  } finally {
    await d.close();
  }
});
