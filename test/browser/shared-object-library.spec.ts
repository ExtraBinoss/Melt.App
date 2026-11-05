import { expect, test, type Locator, type Page } from "@playwright/test";
import { createPage, createProject, createSpatialScene } from "../../packages/core/src/index";

async function mount(page: Page, workspace: string) {
  await page.route("**/library-witness*", (route) =>
    route.fulfill({ contentType: "text/html", body: "<!doctype html><body></body>" }),
  );
  await page.goto(`/library-witness?workspace=${workspace}`);
  const scene = createSpatialScene();
  const project = createProject({
    pages: [
      createPage({
        width: 640,
        height: 480,
        spatial: { ...scene, camera: { ...scene.camera, yaw: 25, pitch: 15 } },
      }),
    ],
  });
  await page.evaluate(
    async ({ project, root }) => {
      const preamble = "/@react-refresh";
      const refresh = (await import(/* @vite-ignore */ preamble)).default;
      refresh.injectIntoGlobalHook(window);
      Object.assign(window, {
        $RefreshReg$: () => {},
        $RefreshSig$: () => (value: unknown) => value,
        __vite_plugin_react_preamble_installed__: true,
      });
      const fixture = "/@fs" + root + "/test/browser/support/library-canvas.tsx";
      await (await import(/* @vite-ignore */ fixture)).mountLibraryCanvas(project);
    },
    { project, root: process.cwd() },
  );
  await expect(page.locator(".editor-gpu-scene canvas")).toHaveAttribute(
    "data-renderer-ready",
    "true",
    { timeout: 40000 },
  );
}

async function nativeDrop(page: Page, source: Locator, spatial: boolean) {
  const editor = page.getByTestId("editor-canvas");
  const box = (await editor.boundingBox())!;
  const board = (await page.getByTestId("artboard").boundingBox())!;
  const position = {
    x: board.x + board.width * 0.78 - box.x,
    y: board.y + board.height * 0.65 - box.y,
  };
  const expected = {
    x: ((box.x + position.x - board.x) * 640) / board.width,
    y: ((box.y + position.y - board.y) * 480) / board.height,
  };
  const before = await page.evaluate(() =>
    JSON.stringify(window.__backgroundEngine!.getSnapshot().project),
  );
  const revision = await page.evaluate(() => window.__backgroundEngine!.getSnapshot().revision);
  await source.dragTo(editor, { targetPosition: position });
  await expect
    .poll(() =>
      page.evaluate(() => window.__backgroundEngine!.getSnapshot().project.pages[0]!.layers.length),
    )
    .toBe(1);
  const actual = await page.evaluate(
    async ({ spatial, root }) => {
      const engine = window.__backgroundEngine!,
        snapshot = engine.getSnapshot(),
        page = snapshot.project.pages[0]!,
        layer = page.layers[0]!;
      if (!spatial)
        return {
          x: layer.x + layer.width / 2,
          y: layer.y + layer.height / 2,
          revision: snapshot.revision,
          kind: layer.kind,
        };
      const corePath = "/@fs" + root + "/packages/core/src/index.ts",
        cameraPath = "/@fs" + root + "/packages/render/src/spatial/camera.ts";
      const { SpatialGeometry } = await import(/* @vite-ignore */ corePath);
      const { createSpatialCamera, updateCompositionCamera } = await import(
        /* @vite-ignore */ cameraPath
      );
      const matrix = new SpatialGeometry(page).anchorMatrix(layer.id);
      const camera = createSpatialCamera(page.spatial!.camera, page.width / page.height);
      updateCompositionCamera(camera, page, camera.coordinateSystem);
      const point = camera.position.clone().set(matrix[12], matrix[13], matrix[14]).project(camera);
      return {
        x: ((point.x + 1) * page.width) / 2,
        y: ((1 - point.y) * page.height) / 2,
        revision: snapshot.revision,
        kind: layer.kind,
      };
    },
    { spatial, root: process.cwd() },
  );
  expect(actual.x).toBeCloseTo(expected.x, 0);
  expect(actual.y).toBeCloseTo(expected.y, 0);
  expect(actual.revision).toBe(revision + 1);
  await page.evaluate(() => window.__backgroundEngine!.undo());
  expect(
    await page.evaluate(() => JSON.stringify(window.__backgroundEngine!.getSnapshot().project)),
  ).toBe(before);
}

for (const workspace of ["classic", "studio"] as const) {
  test(`${workspace}: native shape, primitive and SVG drops share one library and undo`, async ({
    page,
  }) => {
    test.setTimeout(90000);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const packRequests: string[] = [];
    page.on("request", (request) => {
      if (/\/spatial\/packs\/.*\.(?:zip|ndjson)/.test(request.url()))
        packRequests.push(request.url());
    });
    await mount(page, workspace);
    await page.getByRole("button", { name: "Open shape library", exact: true }).click();
    await nativeDrop(page, page.getByRole("button", { name: /^Use / }).first(), false);
    await page.getByRole("button", { name: "3D", exact: true }).click();
    const library = page.locator(".spatial-library");
    await expect(library).toHaveAttribute("data-workspace-theme", workspace);
    await expect(library.getByRole("radio")).toHaveCount(4);
    await expect(library.getByRole("searchbox")).toBeFocused();
    await expect(page.locator("body")).not.toHaveCSS("pointer-events", "none");
    await expect(page.locator("body")).not.toHaveAttribute("data-scroll-locked");
    await library.getByRole("radio", { name: "Packs", exact: true }).click();
    await expect(library.getByRole("button", { name: /Download ·/ })).toBeEnabled();
    expect(packRequests).toEqual([]);
    await library.getByRole("radio", { name: "Shapes", exact: true }).click();
    await nativeDrop(page, library.getByRole("button", { name: "Box", exact: true }), true);
    await page.getByRole("button", { name: "3D", exact: true }).click();
    await library.getByRole("radio", { name: "SVG", exact: true }).click();
    await nativeDrop(page, library.getByRole("button", { name: /^Use / }).first(), true);
    await expect(library).toHaveCount(0);
    for (const dark of [false, true]) {
      await page.evaluate((dark) => document.documentElement.classList.toggle("dark", dark), dark);
      const primary = page.getByRole("button", { name: "Primary", exact: true });
      await expect(primary).toHaveCSS("background-image", /linear-gradient/);
      await expect(page.getByRole("button", { name: "Secondary", exact: true })).toHaveCSS(
        "background-image",
        "none",
      );
      await expect(page.getByRole("button", { name: "Disabled", exact: true })).toBeDisabled();
      await primary.focus();
      await expect(primary).toBeFocused();
    }
    expect(errors).toEqual([]);
    await page.screenshot({ path: `artifacts/studio/library-${workspace}.png` });
  });
}
