import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createProject, createPage } from "@musart/core";

test("the actual file picker recognizes an extensionless JPEG and reports real import failures to the notice, clipboard and console", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.addInitScript(() => {
    localStorage.setItem("musart.onboarding.v1", JSON.stringify({ version: 1, completed: true }));
    localStorage.setItem("musart.editor-tutorial.v1", "done");
    localStorage.setItem("musart.language", "en");
  });
  const failures: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" && message.text().startsWith("[Melt] Editor action failed."))
      failures.push(message.text());
  });
  await page.goto("/editor?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  await page.evaluate(
    (project) => window.musart!.load(project),
    createProject({
      pages: [createPage({ width: 1080, height: 1080 })],
    }),
  );
  const file = page.locator('input[type="file"][accept="image/*,video/*,audio/*,.svg"]');
  const bytes = await readFile(
    process.env.MUSART_IMPORT_IMAGE ?? "apps/web/public/benchmark/06-boathouse-1.jpg",
  );
  await file.setInputFiles({ name: "idk", mimeType: "application/octet-stream", buffer: bytes });
  await expect
    .poll(() => page.evaluate(() => window.musart!.snapshot().project.pages[0]!.layers.length))
    .toBe(1);
  const source = await page.evaluate(
    () => Object.values(window.musart!.snapshot().project.assets)[0]!,
  );
  expect(source).toMatchObject({ name: "idk", mime: "image/jpeg" });
  expect(source.width).toBeGreaterThan(0);
  expect(source.height).toBeGreaterThan(0);
  expect(failures).toEqual([]);
  await file.setInputFiles({ name: "invalid", mimeType: "", buffer: Buffer.from("not an image") });
  const alert = page.getByRole("alert");
  await expect(alert).toContainText("invalid:");
  await expect(alert).toContainText("JPEG");
  await alert.locator("summary").click();
  await expect(alert.locator("pre")).toContainText("IMAGE_FORMAT_UNSUPPORTED");
  await expect.poll(() => failures.join("\n")).toContain("IMAGE_FORMAT_UNSUPPORTED");
  await alert.getByRole("button", { name: "Copy message and diagnostics", exact: true }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(
    "IMAGE_FORMAT_UNSUPPORTED",
  );
  expect(await page.evaluate(() => window.musart!.snapshot().project.pages[0]!.layers.length)).toBe(
    1,
  );
});
