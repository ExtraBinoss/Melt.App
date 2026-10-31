import { expect, test, type Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  createLayer,
  createPage,
  createProject,
  createSpatialLayer,
  createSpatialScene,
  EditorEngine,
} from "@musart/core";
import { installReadbackProbe } from "./support/readback-probe";

const rootSelectors = [
  ".musart-app",
  ".inspector",
  ".canvas-area",
  ".editor-canvas",
  ".editor-gpu-scene",
];
async function commits(page: Page) {
  return page.evaluate(
    (selectors) =>
      selectors.map((selector) =>
        Number(document.querySelector<HTMLElement>(selector)?.dataset.reactRenders),
      ),
    rootSelectors,
  );
}
function fixture() {
  const scene = createSpatialScene();
  scene.reflections = { mode: "environment", quality: "draft" };
  scene.lights[0]!.id = "authored-light";
  const spatial = createSpatialLayer("box");
  spatial.scaleX = 1.3;
  spatial.scaleY = 0.8;
  spatial.scaleZ = 0.6;
  const engine = new EditorEngine(
    createProject({
      pages: [
        createPage({
          id: "authored-scene",
          width: 128,
          height: 128,
          spatial: scene,
          background: "#111111",
          layers: [
            createLayer("rectangle", {
              id: "object",
              width: 100,
              height: 100,
              x: 14,
              y: 14,
              fill: "#FFFFFF",
              spatial,
            }),
          ],
        }),
      ],
    }),
  );
  engine.execute({ type: "setCompositionMode", mode: "motion" });
  return engine;
}

test("native scene diamonds and Auto-key scrub publish one key transaction and cancel cleanly", async ({
  page,
}) => {
  test.setTimeout(60000);
  await installReadbackProbe(page);
  await page.addInitScript(() => {
    localStorage.setItem("musart.language", "en");
    localStorage.setItem("musart.onboarding.v1", JSON.stringify({ version: 1, completed: true }));
  });
  await page.goto("/editor?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  await page.evaluate((project) => {
    window.musart!.load(project);
    window.musart!.select([]);
  }, fixture().getSnapshot().project);
  await page.getByRole("button", { name: "Keyframes", exact: true }).click();
  await page.getByRole("button", { name: "Pin timeline", exact: true }).click();
  await expect(page.locator('.canvas-artboard canvas[data-renderer-ready="true"]')).toBeVisible({
    timeout: 20000,
  });
  const scene = page.locator(".inspector .spatial-properties");
  await scene.getByRole("button", { name: "Camera", exact: true }).click();
  await scene.getByRole("button", { name: "Add keyframe · Azimuth", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.musart!.snapshot().project.pages[0]!.motion!.sceneProperties?.[0]?.keyframes[0]
            ?.value,
      ),
    )
    .toBe(25);
  const time = page.getByRole("spinbutton", { name: "Current time", exact: true });
  await time.fill("1000");
  await time.press("Enter");
  await page.getByRole("button", { name: "Auto-keyframe", exact: true }).click();
  const intensity = scene.getByRole("textbox", { name: "Intensity", exact: true });
  const scrub = scene.getByRole("button", { name: "Adjust Intensity", exact: true });
  await scrub.scrollIntoViewIfNeeded();
  // The scrub handle is outside the tab order; focus and actual primary pointer input still work.
  const bounds = (await scrub.boundingBox())!;
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.down();
  const revision = await page.evaluate(() => window.musart!.snapshot().revision),
    before = await commits(page);
  await page.mouse.move(bounds.x + bounds.width / 2 + 50, bounds.y + bounds.height / 2, {
    steps: 5,
  });
  await expect(intensity).toHaveValue("2");
  expect(await page.evaluate(() => window.musart!.snapshot().revision)).toBe(revision);
  expect(await commits(page)).toEqual(before);
  await page.mouse.up();
  await expect
    .poll(() => page.evaluate(() => window.musart!.snapshot().revision))
    .toBe(revision + 1);
  const state = await page.evaluate(() => window.musart!.snapshot());
  expect(state.project.pages[0]!.spatial!.environment.intensity).toBe(1);
  expect(
    state.project.pages[0]!.motion!.sceneProperties!.find(
      ({ target }) => target.kind === "environment",
    )!.keyframes,
  ).toEqual([expect.objectContaining({ time: { value: 1, rate: 1 }, value: 2 })]);
  await page.evaluate(() => window.musart!.undo());
  expect(
    await page.evaluate(() =>
      window
        .musart!.snapshot()
        .project.pages[0]!.motion!.sceneProperties!.some(
          ({ target }) => target.kind === "environment",
        ),
    ),
  ).toBe(false);
  await page.evaluate(() => window.musart!.redo());
  await expect(intensity).toHaveValue("2");
  await intensity.fill("4");
  await intensity.press("Escape");
  expect(await page.evaluate(() => window.musart!.snapshot().revision)).toBe(state.revision + 2);
  await expect(intensity).toHaveValue("2");
  await scene.getByRole("button", { name: "Remove keyframe · Intensity", exact: true }).click();
  expect(
    await page.evaluate(
      () =>
        window
          .musart!.snapshot()
          .project.pages[0]!.motion!.sceneProperties!.find(
            ({ target }) => target.kind === "environment",
          )!.keyframes,
    ),
  ).toEqual([]);
  await expect(page.locator("body")).not.toHaveCSS("pointer-events", "none");
  expect(await page.evaluate(() => window.__musartVideoReadbacks)).toMatchObject({
    gpu: 0,
    canvas: 0,
    webgl: 0,
  });
});

test("scene-only camera, RGB light and environment channels change separate phases in decoded native Motion exports", async ({
  page,
  browser,
}) => {
  test.setTimeout(90000);
  await installReadbackProbe(page);
  await page.route("**/scene-video-witness", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><title>Scene Motion export</title>",
    }),
  );
  await page.goto("/scene-video-witness");
  const engine = fixture(),
    scene = engine.getSnapshot().project.pages[0]!.spatial!;
  engine.execute({
    type: "updatePage",
    patch: {
      spatial: {
        ...scene,
        environment: { ...scene.environment, intensity: 0.03 },
        camera: { ...scene.camera, yaw: 0, pitch: 10 },
        lights: scene.lights.map((light) => ({
          ...light,
          intensity: 5,
          color: "#ff0000",
          x: -2,
          y: 2,
          z: 5,
        })),
      },
    },
  });
  engine.execute({ type: "setMotionDuration", duration: { value: 9, rate: 10 } });
  for (const [target, start, end, values] of [
    [{ kind: "camera", compositionId: "authored-scene", property: "yaw" }, 0, 3, [0, 60]],
    [
      {
        kind: "light",
        compositionId: "authored-scene",
        lightId: "authored-light",
        property: "color",
      },
      3,
      6,
      ["#ff0000", "#0000ff"],
    ],
    [
      { kind: "environment", compositionId: "authored-scene", property: "intensity" },
      6,
      9,
      [0.03, 3],
    ],
  ] as const)
    engine.transaction(
      values.map((value, index) => ({
        type: "upsertMotionKeyframe",
        target,
        time: { value: index ? end : start, rate: 10 },
        value,
      })),
    );
  const project = engine.getSnapshot().project;
  expect(
    project.pages[0]!.motion!.tracks.every(
      (track) => track.properties.length === 0 && !track.animations?.length,
    ),
  ).toBe(true);
  const moduleUrl = `/@fs${resolve("test/browser/support/spatial-scene-motion-witness.ts")}`;
  const encoded = [];
  for (const forceWebGL of [false, true])
    encoded.push(
      await page.evaluate(
        async ({ project, forceWebGL, moduleUrl }) => {
          const { encodeSceneMotion } = (await import(
            moduleUrl
          )) as typeof import("./support/spatial-scene-motion-witness");
          return encodeSceneMotion(project, forceWebGL);
        },
        { project, forceWebGL, moduleUrl },
      ),
    );
  const inspection = await browser.newPage();
  try {
    await inspection.route("**/scene-video-witness", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: "<!doctype html><title>Decode exported scene</title>",
      }),
    );
    await inspection.goto(new URL("/scene-video-witness", page.url()).href);
    await mkdir("artifacts/property-dependencies", { recursive: true });
    // Persist both native files before decoding or asserting so failures retain complete evidence.
    for (const [backend, video] of encoded.entries())
      await writeFile(
        `artifacts/property-dependencies/scene-${backend}.${video.mimeType === "video/mp4" ? "mp4" : "webm"}`,
        Buffer.from(video.encoded.split(",")[1]!, "base64"),
      );
    await writeFile(
      "artifacts/property-dependencies/scene-project.json",
      JSON.stringify(project, null, 2),
    );
    const evidence = [];
    for (const [backend, video] of encoded.entries()) {
      const decoded = await inspection.evaluate(
        async ({ encoded, moduleUrl }) => {
          const { inspectSceneMotion } = (await import(
            moduleUrl
          )) as typeof import("./support/spatial-scene-motion-witness");
          return inspectSceneMotion(encoded);
        },
        { encoded: video.encoded, moduleUrl },
      );
      const { images, ...measurements } = decoded;
      for (const [frame, image] of images.entries())
        await writeFile(
          `artifacts/property-dependencies/scene-${backend}-frame-${frame}.png`,
          Buffer.from(image.split(",")[1]!, "base64"),
        );
      evidence.push({
        backend: backend ? "webgl" : "webgpu",
        ...measurements,
        encodedFrames: video.frames,
        unchanged: video.unchanged,
        middleLightColor: video.middleLightColor,
        sampledScene: video.sampledScene,
      });
      await writeFile(
        "artifacts/property-dependencies/scene-video.json",
        JSON.stringify(evidence, null, 2),
      );
    }
    // Keep the native color and per-channel change requirements strict after evidence is durable.
    expect(await page.evaluate(() => window.__musartVideoReadbacks)).toMatchObject({
      gpu: 0,
      canvas: 0,
      webgl: 0,
    });
    for (const decoded of evidence) {
      expect(decoded.unchanged).toBe(true);
      expect(decoded.encodedFrames).toBe(9);
      expect(decoded.middleLightColor).toBe("#800080");
      expect(decoded).toMatchObject({ frames: 9, width: 128, height: 128 });
      for (const changed of Object.values(decoded.changes)) expect(changed).toBeGreaterThan(25);
      expect(decoded.redLightPixels).toBeGreaterThan(25);
      expect(decoded.blueLightPixels).toBeGreaterThan(25);
    }
  } finally {
    await inspection.close();
  }
});
