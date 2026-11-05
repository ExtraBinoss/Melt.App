import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { createLayer, createPage, createProject } from "@musart/core";
import { installReadbackProbe } from "./support/readback-probe";

for (const workspace of ["studio", "classic"] as const)
  test(`an already resized legacy background continues under resize, undo/redo and Transparent (${workspace})`, async ({
    page,
    context,
  }) => {
    test.setTimeout(60000);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error" || message.type() === "warn") errors.push(message.text());
    });
    await installReadbackProbe(page);
    await page.addInitScript(() => {
      localStorage.setItem("musart.language", "en");
      localStorage.setItem("musart.editor-tutorial.v1", "done");
    });
    const project = createProject({
      pages: [
        createPage({
          width: 480,
          height: 320,
          background: "#CCBBDD",
          backgroundGradient: {
            kind: "linear",
            angle: 90,
            stops: [
              { offset: 0, color: "#CCBBDD" },
              { offset: 1, color: "#6F40CB" },
            ],
          },
          layers: [
            createLayer("rectangle", {
              id: "legacy-background",
              name: "Arrière-plan",
              x: 70,
              y: 40,
              width: 320,
              height: 200,
              fill: "#24272C",
            }),
          ],
        }),
      ],
    });
    await page.route("**/studio-bg-witness*", (route) =>
      route.fulfill({ contentType: "text/html", body: "<!doctype html><body></body>" }),
    );
    await page.goto(`/studio-bg-witness?automation=1&workspace=${workspace}`);
    await page.evaluate(
      async ({ project, path }) => {
        const refreshPath = "/@react-refresh";
        const runtime = (await import(/* @vite-ignore */ refreshPath)).default;
        runtime.injectIntoGlobalHook(window);
        Object.assign(window, {
          $RefreshReg$: () => {},
          $RefreshSig$: () => (type: unknown) => type,
          __vite_plugin_react_preamble_installed__: true,
        });
        await (await import(/* @vite-ignore */ path)).mountBackgroundCanvas(project);
        window.__backgroundEngine!.select(["legacy-background"]);
      },
      { project, path: `/@fs${resolve("test/browser/support/background-canvas.tsx")}` },
    );
    const ready = () =>
      page
        .waitForFunction(
          () => {
            const canvas = document.querySelector<HTMLCanvasElement>(".editor-gpu-scene canvas");
            return (
              canvas?.dataset.rendererReady === "true" &&
              canvas.dataset.sceneRevision === canvas.dataset.renderedRevision
            );
          },
          undefined,
          { timeout: 12000 },
        )
        .catch(async (error) => {
          console.log(
            JSON.stringify({
              errors,
              canvas: await page.locator(".editor-gpu-scene canvas").evaluateAll((nodes) =>
                nodes.map((node) => ({
                  dataset: { ...(node as HTMLElement).dataset },
                  bounds: node.getBoundingClientRect().toJSON(),
                })),
              ),
            }),
          );
          throw error;
        });
    const canvas = page.locator(".editor-gpu-scene canvas");
    const capture = () => canvas.evaluate((node) => (node as HTMLCanvasElement).toDataURL());
    await ready();
    const original = await page.evaluate(() =>
      JSON.stringify(window.__backgroundEngine!.getSnapshot().project),
    );
    const revision = await page.evaluate(() => window.__backgroundEngine!.getSnapshot().revision);
    const frames = await canvas.getAttribute("data-render-count");
    const before = await capture();
    const handle = page.locator(
      '.canvas-handle[data-layer-id="legacy-background"][data-handle="w"]',
    );
    await expect(handle).toBeVisible();
    const bounds = (await handle.boundingBox())!;
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    await page.mouse.down();
    await page.mouse.move(bounds.x + bounds.width / 2 + 180, bounds.y + bounds.height / 2, {
      steps: 12,
    });
    await expect.poll(() => canvas.getAttribute("data-render-count")).not.toBe(frames);
    await ready();
    const during = await capture();
    expect(await page.evaluate(() => window.__backgroundEngine!.getSnapshot().revision)).toBe(
      revision,
    );
    await page.mouse.up();
    await ready();
    expect(await page.evaluate(() => window.__backgroundEngine!.getSnapshot().revision)).toBe(
      revision + 1,
    );
    const after = await capture();
    await page.evaluate(() => window.__backgroundEngine!.undo());
    await ready();
    expect(
      await page.evaluate(() => JSON.stringify(window.__backgroundEngine!.getSnapshot().project)),
    ).toBe(original);
    await page.evaluate(() => window.__backgroundEngine!.redo());
    await ready();
    await page.locator(".studio-background-trigger").click();
    await page
      .locator(".studio-background-modes")
      .getByRole("button", { name: "Transparent", exact: true })
      .click();
    await ready();
    const transparent = await capture();
    const visible = (await canvas.screenshot()).toString("base64");
    const inspector = await context.newPage();
    try {
      const pixels = await inspector.evaluate(
        async (frames) => {
          const output = [];
          for (const frame of frames) {
            const image = new Image();
            image.src = frame;
            await image.decode();
            const canvas = document.createElement("canvas");
            canvas.width = image.width;
            canvas.height = image.height;
            const ctx = canvas.getContext("2d")!;
            ctx.drawImage(image, 0, 0);
            output.push(
              [1, image.width - 2].map((x) =>
                Array.from(ctx.getImageData(x, Math.floor(image.height / 2), 1, 1).data),
              ),
            );
          }
          return output;
        },
        [before, during, after, transparent, `data:image/png;base64,${visible}`],
      );
      for (const frame of pixels.slice(0, 3))
        for (const pixel of frame) expect(pixel).toEqual([36, 39, 44, 255]);
      for (const pixel of pixels[3]!) expect(pixel[3]).toBe(0);
      for (const pixel of pixels[4]!)
        expect(Math.max(...pixel.slice(0, 3)) - Math.min(...pixel.slice(0, 3))).toBeLessThan(15);
    } finally {
      await inspector.close();
    }
    expect(await page.evaluate(() => window.__musartVideoReadbacks)).toMatchObject({
      gpu: 0,
      webgl: 0,
      canvas: 0,
    });
    await page.evaluate(() => window.__disposeBackground?.());
  });
