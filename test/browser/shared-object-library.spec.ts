import { expect, test } from "@playwright/test";
import { createPage, createProject } from "../../packages/core/src/index";

for (const workspace of ["classic", "studio"] as const) {
  test(`${workspace} shares the complete object library and inserts editable SVGs on the active page`, async ({
    page,
  }) => {
    test.setTimeout(90000);
    const packRequests: string[] = [];
    page.on("request", (request) => {
      if (/\/spatial\/packs\/.*\.(?:zip|ndjson)/.test(request.url()))
        packRequests.push(request.url());
    });
    await page.addInitScript(() => {
      localStorage.setItem("musart.language", "en");
      localStorage.setItem("musart.editor-tutorial.v1", "done");
      localStorage.setItem("musart.onboarding.v1", JSON.stringify({ version: 1, completed: true }));
    });
    await page.goto(`/editor?automation=1&workspace=${workspace}`);
    await page.waitForFunction(() => Boolean(window.musart), undefined, { timeout: 60000 });
    const first = createPage({ width: 512, height: 512, layers: [] });
    const active = createPage({ width: 1200, height: 800, layers: [] });
    await page.evaluate(
      ({ project, pageId }) => {
        window.musart!.load(project);
        window.musart!.page(pageId);
      },
      { project: createProject({ pages: [first, active] }), pageId: active.id },
    );
    const toolbar = page.locator(workspace === "studio" ? ".studio-quick-add" : ".toolbar");
    const trigger = toolbar.getByRole("button", { name: "3D", exact: true });
    await trigger.click();
    const library = page.locator(".spatial-library");
    await expect(library).toHaveAttribute("data-workspace-theme", workspace);
    await expect(library.getByRole("radio")).toHaveCount(4);
    await expect(library.getByRole("searchbox")).toBeFocused();
    await expect(page.locator("body")).not.toHaveCSS("pointer-events", "none");
    await expect(page.locator("body")).not.toHaveAttribute("data-scroll-locked");
    await library.getByRole("radio", { name: "Packs", exact: true }).click();
    await expect(library.getByRole("button", { name: /Download ·/ })).toBeEnabled();
    expect(packRequests).toEqual([]);
    await library.getByRole("radio", { name: "SVG", exact: true }).click();
    const vectors = library.locator(".studio-vector-library");
    await expect(vectors.getByRole("button", { name: /^Use / }).first()).toBeVisible();
    await library.getByRole("searchbox").fill("no-matching-vector-938274");
    await expect(vectors.getByRole("button", { name: /^Use / })).toHaveCount(0);
    await library.getByRole("searchbox").fill("");
    const before = await page.evaluate(() => JSON.stringify(window.musart!.snapshot().project));
    await vectors.getByRole("button", { name: /^Use / }).first().click();
    await expect(library).toHaveCount(0);
    const snapshot = await page.evaluate(() => window.musart!.snapshot());
    expect(snapshot.project.pages[0]!.layers).toEqual([]);
    const layer = snapshot.project.pages[1]!.layers[0]!;
    expect(layer.kind).toBe("vector");
    expect(layer.spatial?.source).toBe("extrude");
    expect(snapshot.selection).toEqual([layer.id]);
    expect(layer.x).toBe((active.width - layer.width) / 2);
    expect(layer.y).toBe((active.height - layer.height) / 2);
    await page.evaluate(() => window.musart!.undo());
    expect(await page.evaluate(() => JSON.stringify(window.musart!.snapshot().project))).toBe(
      before,
    );
    await page.evaluate(() => window.musart!.redo());
    expect(
      await page.evaluate(() => window.musart!.snapshot().project.pages[1]!.layers[0]),
    ).toEqual(layer);
    await trigger.click();
    await library.getByRole("radio", { name: "SVG", exact: true }).click();
    await vectors.getByRole("switch").click();
    await vectors.getByRole("button", { name: /^Use / }).first().click();
    await expect(library).toHaveCount(0);
    expect(
      await page.evaluate(() => window.musart!.snapshot().project.pages[1]!.layers[1]!.spatial),
    ).toBeUndefined();
  });
}
