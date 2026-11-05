import { expect, test, type Page } from "@playwright/test";
import {
  createLayer,
  createPage,
  createProject,
  createSpatialLayer,
  createSpatialScene,
} from "@musart/core";

/** Decode only browser screenshots in a separate page, never the production GPU canvas. */
async function inkPoint(decoder: Page, png: Buffer) {
  return decoder.evaluate(
    async (url) => {
      const image = new Image();
      image.src = url;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext("2d")!;
      context.drawImage(image, 0, 0);
      const bytes = context.getImageData(0, 0, image.width, image.height).data;
      const blue = (x: number, y: number) => {
        const offset = (y * image.width + x) * 4;
        return (
          bytes[offset + 2]! > 90 &&
          bytes[offset + 2]! > bytes[offset]! * 1.4 &&
          bytes[offset + 2]! > bytes[offset + 1]! * 1.2
        );
      };
      for (let y = 4; y < image.height - 4; y++)
        for (let x = 4; x < image.width - 4; x++)
          if (blue(x, y) && blue(x - 3, y) && blue(x + 3, y) && blue(x, y - 3) && blue(x, y + 3))
            return { x: x / image.width, y: y / image.height };
      throw new Error("No blue glyph interior was presented");
    },
    `data:image/png;base64,${png.toString("base64")}`,
  );
}

for (const spatial of [false, true]) {
  const kind = spatial ? "3D lit" : "2D gradient";
  test(`${kind} text keeps GPU ink while letters are selected for editing`, async ({ page }) => {
    test.setTimeout(90000);
    await page.routeWebSocket("**", () => {});
    await page.addInitScript(() => {
      localStorage.setItem("musart.editor-tutorial.v1", "done");
      localStorage.setItem("musart.onboarding.v1", JSON.stringify({ version: 1, completed: true }));
      localStorage.setItem("musart.language", "en");
    });
    await page.goto("/editor?automation=1&workspace=classic");
    await page.waitForFunction(() => Boolean(window.musart));
    const scene = createSpatialScene();
    scene.camera.yaw = 8;
    scene.camera.pitch = 5;
    scene.environment.preset = "none";
    scene.reflections!.mode = "environment";
    const project = createProject({
      id: `selection-ink-${spatial}`,
      pages: [
        createPage({
          id: "ink-page",
          width: 640,
          height: 320,
          background: "#151520",
          ...(spatial ? { spatial: scene } : {}),
          layers: [
            createLayer("text", {
              id: "ink-text",
              text: "MELT COLOR",
              x: 40,
              y: 65,
              width: 560,
              height: 160,
              fontFamily: "Inter Variable",
              fontSize: 76,
              fontWeight: 700,
              fill: "#2463eb",
              ...(spatial
                ? { spatial: createSpatialLayer("extrude") }
                : {
                    fillGradient: {
                      kind: "linear" as const,
                      angle: 0,
                      stops: [
                        { offset: 0, color: "#2444dd" },
                        { offset: 1, color: "#4488ff" },
                      ],
                    },
                  }),
            }),
          ],
        }),
      ],
    });
    await page.evaluate((value) => window.musart!.load(value), project);
    const canvas = page.locator(".editor-gpu-scene canvas");
    await expect(canvas).toHaveAttribute("data-project-id", project.id);
    await page.waitForFunction(
      () => {
        const data = document.querySelector<HTMLCanvasElement>(".editor-gpu-scene canvas")?.dataset;
        return (
          data?.presentationReady === "true" &&
          data.rendererReady === "true" &&
          data.renderedRevision === data.sceneRevision
        );
      },
      undefined,
      { timeout: 40000 },
    );
    const decoder = await page.context().newPage();
    try {
      const point = await inkPoint(decoder, await canvas.screenshot());
      const bounds = (await canvas.boundingBox())!;
      await page.mouse.dblclick(
        bounds.x + point.x * bounds.width,
        bounds.y + point.y * bounds.height,
      );
      const editor = page.getByTestId("canvas-text-editor");
      await expect(editor).toBeFocused();
      // Real keyboard selection, independent of the initial select-all on entry.
      await editor.press("Control+Home");
      for (let i = 0; i < 4; i++) await editor.press("Shift+ArrowRight");
      expect(
        await editor.evaluate((field: HTMLTextAreaElement) => [
          field.selectionStart,
          field.selectionEnd,
        ]),
      ).toEqual([0, 4]);
      const colors = await editor.evaluate((field) => {
        const selection = getComputedStyle(field, "::selection");
        return {
          color: selection.color,
          fill: selection.webkitTextFillColor,
          background: selection.backgroundColor,
          caret: getComputedStyle(field).caretColor,
        };
      });
      expect(colors.color).toBe("rgba(0, 0, 0, 0)");
      expect(colors.fill).toBe("rgba(0, 0, 0, 0)");
      expect(colors.background).not.toBe("rgba(0, 0, 0, 0)");
      expect(colors.caret).not.toBe("rgba(0, 0, 0, 0)");
      await page.mouse.move(0, 0);
      await canvas.screenshot({
        path: `artifacts/browser/text-selection-${spatial ? "3d" : "2d"}.png`,
      });
      // Remove just the highlight/caret/outline to isolate native glyph ink. The
      // visible selected field must add no glyph pixels over the live GPU faces.
      await page.addStyleTag({
        content: `
        .canvas-text-editor { caret-color: transparent; outline: none; }
        .canvas-text-editor::selection { background: transparent; }
      `,
      });
      const visible = await canvas.screenshot();
      await editor.evaluate((field) => {
        field.style.opacity = "0";
      });
      expect((await canvas.screenshot()).equals(visible)).toBe(true);
      await editor.evaluate((field) => {
        field.style.opacity = "1";
      });
      await editor.press("Escape");
      await expect(editor).toHaveCount(0);
      expect(await page.evaluate(() => window.musart!.snapshot().canUndo)).toBe(false);
    } finally {
      await decoder.close();
    }
  });
}
