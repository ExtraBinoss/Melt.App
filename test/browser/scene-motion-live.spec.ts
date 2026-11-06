import { resolve } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import {
  createEffect,
  createLayer,
  createPage,
  createProject,
  createSpatialLayer,
  createSpatialScene,
  EditorEngine,
  SCENE_MOTION_ANIMATION_PRESETS,
} from "@musart/core";
import { installReadbackProbe } from "./support/readback-probe";
test.use({ channel: "chromium", trace: "off" });

for (const workspace of ["classic", "studio"] as const)
  test(`camera orbit renders live before pause and its catalogue previews natively (${workspace})`, async ({
    page,
  }) => {
    test.setTimeout(60000);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await installReadbackProbe(page);
    await page.addInitScript(() => {
      localStorage.setItem("musart.language", "en");
      localStorage.setItem("musart.editor-tutorial.v1", "done");
    });
    const scene = createSpatialScene();
    scene.reflections = { mode: "environment", quality: "draft" };
    scene.camera = { ...scene.camera, yaw: 0, pitch: 0 };
    const engine = new EditorEngine(
      createProject({
        pages: [
          createPage({
            id: "scene-motion-live",
            width: 320,
            height: 240,
            background: "#20232b",
            spatial: scene,
            layers: [
              createLayer("text", {
                id: "subject",
                x: 80,
                y: 50,
                width: 140,
                height: 140,
                fill: "#b3a6fa",
                text: "MELT",
                fontFamily: "Inter Variable",
                fontSize: 56,
                effects: [createEffect("shatter", { scale: 24 })],
                spatial: createSpatialLayer("extrude"),
              }),
            ],
          }),
        ],
      }),
    );
    engine.execute({ type: "setCompositionMode", mode: "motion" });
    engine.execute({
      type: "setMotionDuration",
      duration: { value: 8, rate: 1 },
    });
    engine.execute({
      type: "addMotionAnimation",
      owner: { kind: "camera", compositionId: "scene-motion-live" },
      preset: {
        ...SCENE_MOTION_ANIMATION_PRESETS.find((preset) => preset.id === "scene-camera-orbit")!,
        channels: [
          {
            target: { kind: "camera", property: "yaw" },
            operation: "replace",
            points: [
              { at: 0, value: 0, easing: { type: "linear" } },
              { at: 1, value: 360, easing: { type: "linear" } },
            ],
          },
        ],
      },
      start: { value: 0, rate: 1 },
    });
    await page.route("**/scene-motion-witness*", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: "<!doctype html><body></body>",
      }),
    );
    await page.goto(`/scene-motion-witness?automation=1&workspace=${workspace}`);
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
        await (await import(/* @vite-ignore */ path)).mountSceneMotionCanvas(project);
      },
      {
        project: engine.getSnapshot().project,
        path: `/@fs${resolve("test/browser/support/scene-motion-canvas.tsx")}`,
      },
    );
    const canvas = page.locator(".editor-gpu-scene canvas");
    await expect(canvas).toHaveAttribute("data-renderer-ready", "true", {
      timeout: 20000,
    });
    const before = await page.evaluate(() => window.__sceneMotion!.read());
    await page.evaluate(() => window.__sceneMotion!.play());
    const first = await canvas.screenshot({ animations: "allow" });
    const time = await canvas.getAttribute("data-presented-motion-time");
    // A scene-only action must advance the actual presented canvas during Play.
    await expect
      .poll(() => canvas.getAttribute("data-presented-motion-time"), {
        timeout: 15000,
      })
      .not.toBe(time);
    const firstPose = await page.evaluate(() => window.__sceneMotion!.read());
    await expect
      .poll(async () => (await page.evaluate(() => window.__sceneMotion!.read())).yaw)
      .not.toBe(firstPose.yaw);
    const second = await canvas.screenshot({ animations: "allow" });
    const secondPose = await page.evaluate(() => window.__sceneMotion!.read());
    expect(firstPose.playing).toBe(true);
    expect(secondPose.playing).toBe(true);
    expect(secondPose.revision).toBe(before.revision);
    expect(second.equals(first)).toBe(false);
    for (const yaw of [89, 91, 269, 271]) {
      const seconds = yaw / 45;
      await page.evaluate((time) => window.__sceneMotion!.seek(time), seconds);
      await expect
        .poll(async () => {
          const time = JSON.parse(
            (await canvas.getAttribute("data-presented-motion-time")) ?? "null",
          );
          return time ? time.value / time.rate : null;
        })
        .toBeCloseTo(seconds, 5);
    }
    await page.evaluate(() => window.__sceneMotion!.catalogue());
    const timings = [];
    await mkdir("artifacts/scene-preset-preview", { recursive: true });
    for (const id of [
      "scene-camera-orbit",
      "scene-camera-push",
      "scene-environment-turn",
      "scene-light-pulse",
    ]) {
      const card = page.locator(`[data-preset-id="${id}"]`);
      await card.hover();
      const preview = card.locator(".animation-card-live canvas");
      await expect(preview).toBeVisible({ timeout: 15000 });
      await expect(preview).toHaveAttribute("data-backend", /webgpu|webgl/);
      const initialFrame = await preview.getAttribute("data-preview-frames");
      const initial = await preview.screenshot();
      await expect.poll(() => preview.getAttribute("data-preview-frames")).not.toBe(initialFrame);
      await expect
        .poll(async () => Number(await preview.getAttribute("data-preview-time")))
        .toBeGreaterThan(640);
      const moved = await preview.screenshot();
      expect(moved.equals(initial), `${id} must change actual rendered pixels`).toBe(false);
      timings.push({ id, readyMs: Number(await preview.getAttribute("data-preview-ready-ms")) });
      await writeFile(`artifacts/scene-preset-preview/${workspace}-${id}.png`, moved);
      await expect(page.getByRole("alert")).toHaveCount(0);
    }
    await writeFile(
      `artifacts/scene-preset-preview/${workspace}.json`,
      JSON.stringify(timings, null, 2),
    );
    const revision = await page.evaluate(() => window.__sceneMotion!.read().revision);
    expect(revision).toBe(before.revision);
    expect(await page.evaluate(() => window.__musartVideoReadbacks)).toMatchObject({
      gpu: 0,
      webgl: 0,
      canvas: 0,
    });
    expect(errors).toEqual([]);
    await page.evaluate(() => window.__sceneMotion!.dispose());
  });
