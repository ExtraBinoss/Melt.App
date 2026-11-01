import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";

test("Bloom and Melt cards request the final rendered poster bytes with their current content revision", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem("musart.onboarding.v1", JSON.stringify({ version: 1, completed: true }));
    localStorage.setItem("musart.language", "en");
  });
  await page.goto("/editor?automation=1");
  await page.waitForFunction(() => !!window.musart);
  await page.getByRole("button", { name: "Project menu", exact: true }).click();
  await page.locator(".library-navigation-item").filter({ hasText: "Templates" }).click();
  for (const id of ["bloom-windows", "morphing-type"]) {
    const bytes = await readFile(`apps/web/public/templates/motion/${id}/${id}.webp`);
    const expected = createHash("sha256").update(bytes).digest("hex");
    const image = page.locator(`.template-grid img[src*="/${id}/${id}.webp?"]`);
    await expect(image).toBeVisible();
    await expect
      .poll(() =>
        image.evaluate((node: HTMLImageElement) => node.complete && node.naturalWidth > 0),
      )
      .toBe(true);
    const src = (await image.getAttribute("src"))!;
    expect(new URL(src, page.url()).searchParams.get("v")).toContain(expected.slice(0, 12));
    const downloaded = await page.evaluate(async (url) => {
      const response = await fetch(url, { cache: "force-cache" });
      if (!response.ok) throw Error(`Poster HTTP ${response.status}`);
      return [
        ...new Uint8Array(await crypto.subtle.digest("SHA-256", await response.arrayBuffer())),
      ]
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
    }, src);
    expect(downloaded).toBe(expected);
  }
});
