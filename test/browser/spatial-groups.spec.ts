import { expect, test } from "@playwright/test";
import {
  createLayer,
  createPage,
  createProject,
  createSpatialLayer,
  createSpatialScene,
} from "@musart/core";

test("inspector grouping exposes a native parent gizmo and one undo restores the group pose", async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.addInitScript(() => {
    localStorage.setItem("musart.language", "en");
    localStorage.setItem("musart.onboarding.v1", JSON.stringify({ version: 1, completed: true }));
  });
  await page.goto("/editor?automation=1&profile3d=1");
  await page.waitForFunction(() => Boolean(window.musart));
  const scene = createSpatialScene();
  scene.camera.yaw = 0;
  scene.camera.pitch = 0;
  scene.reflections!.mode = "environment";
  const project = createProject({
    pages: [
      createPage({
        id: "native-group",
        width: 300,
        height: 300,
        spatial: scene,
        layers: [
          createLayer("rectangle", {
            id: "a",
            x: 0,
            y: 0,
            width: 300,
            height: 300,
            fill: "#8757FF",
            spatial: {
              ...createSpatialLayer("box"),
              x: -0.6,
              scaleX: 0.4,
              scaleY: 0.6,
              scaleZ: 0.4,
            },
          }),
          createLayer("rectangle", {
            id: "b",
            x: 0,
            y: 0,
            width: 300,
            height: 300,
            fill: "#20CF66",
            spatial: {
              ...createSpatialLayer("sphere"),
              x: 0.6,
              scaleX: 0.4,
              scaleY: 0.4,
              scaleZ: 0.4,
            },
          }),
        ],
      }),
    ],
  });
  await page.evaluate((project) => {
    window.musart!.load(project);
    window.musart!.select(["a", "b"]);
  }, project);
  const canvas = page.locator(".editor-gpu-scene canvas");
  await expect(canvas).toHaveAttribute("data-renderer-ready", "true", { timeout: 30000 });
  await page
    .locator(".inspector")
    .getByRole("button", { name: "Group selection", exact: true })
    .click();
  const group = await page.evaluate(() => {
    const s = window.musart!.snapshot();
    return s.project.pages[0]!.layers.find((l) => l.id === s.selection[0])!;
  });
  expect(group.spatial?.source).toBe("group");
  const toolbar = page.locator("[data-spatial-toolbar]");
  await toolbar.getByRole("radio", { name: "3D", exact: true }).click();
  await canvas.focus();
  await page.keyboard.press("r");
  await expect(canvas).toHaveAttribute("data-spatial-center", /x/);
  const box = (await canvas.boundingBox())!;
  const center = JSON.parse((await canvas.getAttribute("data-spatial-center"))!) as {
    x: number;
    y: number;
  };
  const x = box.x + box.width * center.x,
    y = box.y + box.height * center.y;
  let picked: { x: number; y: number } | null = null;
  for (let radius = 18; radius <= 100 && !picked; radius += 14)
    for (let angle = 0; angle < Math.PI * 2 && !picked; angle += Math.PI / 8) {
      const at = { x: x + Math.cos(angle) * radius, y: y + Math.sin(angle) * radius };
      await page.mouse.move(at.x, at.y);
      const gizmo = JSON.parse((await canvas.getAttribute("data-spatial-gizmo")) ?? "{}") as {
        axis?: string;
      };
      if (["X", "Y", "Z"].includes(gizmo.axis ?? "")) picked = at;
    }
  expect(picked).not.toBeNull();
  await page.mouse.move(picked!.x, picked!.y);
  await page.mouse.down();
  await page.mouse.move(picked!.x + 35, picked!.y + 25, { steps: 8 });
  await page.mouse.up();
  const moved = await page.evaluate(
    (id) => window.musart!.snapshot().project.pages[0]!.layers.find((l) => l.id === id)!.spatial,
    group.id,
  );
  expect(moved).not.toEqual(group.spatial);
  const children = await page.evaluate(() =>
    window
      .musart!.snapshot()
      .project.pages[0]!.layers.filter((l) => l.kind !== "group")
      .map((l) => l.spatial),
  );
  expect(children).toEqual(project.pages[0]!.layers.map((l) => l.spatial));
  await page.evaluate(() => window.musart!.undo());
  expect(
    await page.evaluate(
      (id) => window.musart!.snapshot().project.pages[0]!.layers.find((l) => l.id === id)!.spatial,
      group.id,
    ),
  ).toEqual(group.spatial);
  await expect(canvas).not.toHaveAttribute("data-render-error");
});
