import { expect, test } from "@playwright/test";
import { resolve } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import {
  createLayer,
  createPage,
  createProject,
  createSpatialLayer,
  createSpatialScene,
  EditorEngine,
} from "@musart/core";
import { installReadbackProbe } from "./support/readback-probe";

test("native appearance edits reuse unrelated sources and scene Motion samples camera/light/environment on both backends", async ({
  page,
}) => {
  test.setTimeout(90000);
  await installReadbackProbe(page);
  await page.route("**/property-witness", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><title>Scene property dependencies</title>",
    }),
  );
  await page.goto("/property-witness");
  const scene = createSpatialScene();
  scene.reflections = { mode: "environment", quality: "draft" };
  scene.camera.yaw = 0;
  scene.camera.pitch = 0;
  scene.lights[0]!.id = "key-light";
  const engine = new EditorEngine(
    createProject({
      pages: [
        createPage({
          id: "scene-properties",
          width: 256,
          height: 256,
          spatial: scene,
          layers: ["left", "right"].map((id, index) =>
            createLayer("rectangle", {
              id,
              width: 96,
              height: 96,
              x: 20 + index * 120,
              y: 80,
              fill: "#8757FF",
              spatial: createSpatialLayer("box"),
            }),
          ),
        }),
      ],
    }),
  );
  engine.execute({ type: "setCompositionMode", mode: "motion" });
  for (const [target, values] of [
    [{ kind: "camera", compositionId: "scene-properties", property: "yaw" }, [0, 45]],
    [{ kind: "environment", compositionId: "scene-properties", property: "intensity" }, [0.5, 2]],
    [
      { kind: "light", compositionId: "scene-properties", lightId: "key-light", property: "x" },
      [-3, 3],
    ],
  ] as const)
    engine.transaction(
      values.map((value, index) => ({
        type: "upsertMotionKeyframe",
        target,
        time: { value: index * 2, rate: 1 },
        value,
      })),
    );
  const result = await page.evaluate(
    async (input) => {
      const witness = (await import(
        input.witnessUrl
      )) as typeof import("./support/spatial-dependency-witness");
      return witness.runPropertyDependenciesWitness(input.project);
    },
    {
      project: engine.getSnapshot().project,
      witnessUrl: `/@fs${resolve("test/browser/support/spatial-dependency-witness.ts")}`,
    },
  );
  await mkdir("artifacts/property-dependencies", { recursive: true });
  await writeFile(
    "artifacts/property-dependencies/dependencies.json",
    JSON.stringify(result, (key, value: unknown) => (key === "image" ? undefined : value), 2),
  );
  for (const [backend, output] of result.results.entries()) {
    expect(output.first.rendered.sort()).toEqual(["left", "right"]);
    expect(output.paint.rendered).toEqual(["left"]);
    expect(output.paint.image).not.toBe(output.first.image);
    // Capture counts describe this sample, rather than a session cumulative counter.
    expect(output.probes.captures).toBeGreaterThan(0);
    expect(output.recapture.captures).toBeGreaterThan(0);
    expect(output.probes.rendered.sort()).toEqual(["left", "right"]);
    expect(output.recapture.rendered.sort()).toEqual(["left", "right"]);
    expect(output.recapture.image).not.toBe(output.probes.image);
    expect(output.sampled).toEqual({ yaw: 22.5, intensity: 1.25, x: 0 });
    expect(output.motionStart.rendered.sort()).toEqual(["left", "right"]);
    expect(output.motionEnd.rendered.sort()).toEqual(["left", "right"]);
    expect(output.endpoint).toEqual({
      terminalPreview: true,
      activeLayerIds: ["left", "right"],
      yaw: 45,
      intensity: 2,
      x: 3,
    });
    expect(output.motionEnd.image).not.toBe(output.motionStart.image);
    for (const [name, frame] of Object.entries({
      paint: output.paint,
      probes: output.probes,
      recapture: output.recapture,
      motionStart: output.motionStart,
      motionEnd: output.motionEnd,
    }))
      await writeFile(
        `artifacts/property-dependencies/${backend}-${name}.png`,
        Buffer.from(frame.image.split(",")[1]!, "base64"),
      );
  }
  expect(result.readbacks).toMatchObject({ gpu: 0, canvas: 0, webgl: 0 });
});
