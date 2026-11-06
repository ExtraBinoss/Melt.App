import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  createLayer,
  createPage,
  createProject,
  createSpatialLayer,
  createSpatialScene,
} from "@musart/core";

async function handle(page: Page, canvas: Locator, axis: string) {
  const box = (await canvas.boundingBox())!;
  const center = JSON.parse((await canvas.getAttribute("data-spatial-center"))!) as {
    x: number;
    y: number;
  };
  const x = box.x + box.width * center.x,
    y = box.y + box.height * center.y;
  for (let radius = 20; radius <= 120; radius += 10)
    for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 12) {
      const point = { x: x + Math.cos(angle) * radius, y: y + Math.sin(angle) * radius };
      await page.mouse.move(point.x, point.y);
      const state = JSON.parse((await canvas.getAttribute("data-spatial-gizmo")) ?? "{}") as {
        axis?: string;
      };
      if (state.axis === axis) return point;
    }
  throw new Error(`Native ${axis} handle was not pickable`);
}

/** Read a changed native field across a browser paint opportunity, not React counters alone. */
async function armFieldPresentation(input: Locator) {
  await input.evaluate((node) => {
    const field = node as HTMLInputElement;
    const samples: number[] = [];
    const frames = new Set<number>();
    const frame = (callback: () => void) => {
      const id = requestAnimationFrame(() => {
        frames.delete(id);
        callback();
      });
      frames.add(id);
    };
    const moved = (event: PointerEvent) => {
      if (!event.buttons) return;
      const before = field.value,
        started = event.timeStamp;
      frame(() => {
        if (field.value !== before) frame(() => samples.push(performance.now() - started));
      });
    };
    window.addEventListener("pointermove", moved, true);
    field.addEventListener(
      "stop-field-probe",
      () => {
        window.removeEventListener("pointermove", moved, true);
        for (const id of frames) cancelAnimationFrame(id);
        field.dataset.presentationDelays = JSON.stringify(samples);
      },
      { once: true },
    );
  });
}

for (const workspace of ["classic", "studio"])
  test(`Shift snaps native transforms despite focus changes in ${workspace}`, async ({
    page,
  }, info) => {
    test.setTimeout(120000);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.addInitScript(() => {
      localStorage.setItem("musart.language", "en");
      localStorage.setItem("musart.editor-tutorial.v1", "done");
      localStorage.setItem("musart.onboarding.v1", JSON.stringify({ version: 1, completed: true }));
    });
    await page.goto(`/editor?automation=1&profile3d=1&workspace=${workspace}`);
    await page.waitForFunction(() => !!window.musart);
    const scene = createSpatialScene();
    scene.camera.yaw = 0;
    scene.camera.pitch = 0;
    scene.reflections!.mode = "environment";
    const project = createProject({
      pages: [
        createPage({
          width: 600,
          height: 600,
          spatial: scene,
          layers: [
            createLayer("rectangle", {
              id: "box",
              x: 0,
              y: 0,
              width: 600,
              height: 600,
              spatial: createSpatialLayer("box"),
            }),
          ],
        }),
      ],
    });
    await page.evaluate((project) => {
      window.musart!.load(project);
      window.musart!.select(["box"]);
    }, project);
    const canvas = page.locator(".editor-gpu-scene canvas");
    await expect(canvas).toHaveAttribute("data-renderer-ready", "true", { timeout: 30000 });
    const toolbar = page.locator("[data-spatial-toolbar]");
    if (workspace === "classic") {
      await toolbar.getByRole("radio", { name: "3D", exact: true }).click();
      for (const label of ["Move", "Rotate", "Scale"]) {
        await toolbar.getByRole("button", { name: label, exact: true }).hover();
        const tooltip = page.locator('[data-slot="tooltip-content"]:visible');
        await expect(tooltip).toBeVisible();
        await expect(tooltip).toHaveAttribute("data-side", /^(top|bottom)$/);
        await page.mouse.move(0, 0);
        await expect(tooltip).toBeHidden();
      }
    }
    await expect(canvas).toHaveAttribute("data-spatial-center", /x/);
    const properties = page.locator(".spatial-properties");
    if (workspace === "classic")
      await properties.getByRole("button", { name: "Transform", exact: true }).click();
    for (const mode of ["translate", "rotate", "scale"] as const) {
      await canvas.focus();
      await page.keyboard.press(mode === "translate" ? "g" : mode === "rotate" ? "r" : "s");
      const point = await handle(page, canvas, mode === "rotate" ? "Z" : "X");
      const before = await page.evaluate(() => JSON.stringify(window.musart!.snapshot().project));
      const commits = () =>
        page
          .locator(".musart-app,.inspector,.canvas-area,.editor-canvas,.editor-gpu-scene")
          .evaluateAll((nodes) => nodes.map((n) => n.getAttribute("data-react-renders")));
      const rendered = await commits();
      const input =
        workspace === "classic"
          ? properties.getByRole("textbox", {
              name:
                mode === "translate" ? "Position X" : mode === "rotate" ? "Rotation Z" : "Scale X",
              exact: true,
            })
          : null;
      if (input) await armFieldPresentation(input);
      // Hold Shift outside the canvas before the native pointer acquires focus.
      await page.locator("button").first().focus();
      await page.keyboard.down("Shift");
      await page.mouse.move(point.x, point.y);
      await page.mouse.down();
      await page.mouse.move(point.x + 47, point.y + (mode === "rotate" ? 43 : 0), { steps: 8 });
      expect(await page.evaluate(() => JSON.stringify(window.musart!.snapshot().project))).toBe(
        before,
      );
      expect(await commits()).toEqual(rendered);
      if (input) {
        await expect(input).not.toHaveValue(mode === "scale" ? "1" : "0");
        await page.evaluate(
          () =>
            new Promise<void>((resolve) =>
              requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
            ),
        );
        const delays = await input.evaluate((node) => {
          node.dispatchEvent(new Event("stop-field-probe"));
          return JSON.parse((node as HTMLElement).dataset.presentationDelays!) as number[];
        });
        expect(delays.length).toBeGreaterThan(0);
        await info.attach(`native-${mode}-field-presentation`, {
          body: JSON.stringify({
            delays,
            backend: await canvas.getAttribute("data-backend"),
            browser: page.context().browser()!.version(),
            environment: "development server; two-RAF presentation opportunity",
          }),
          contentType: "application/json",
        });
      }
      await page.mouse.up();
      // Release Shift after focus has moved away again.
      await page.locator("button").first().focus();
      await page.keyboard.up("Shift");
      const pose = await page.evaluate(
        () => window.musart!.snapshot().project.pages[0]!.layers[0]!.spatial!,
      );
      const value =
        mode === "translate" ? pose.x : mode === "rotate" ? pose.rotationZ : pose.scaleX;
      const step = mode === "rotate" ? 15 : 0.1;
      expect(Math.abs(value - (mode === "scale" ? 1 : 0))).toBeGreaterThan(0.01);
      expect(value / step).toBeCloseTo(Math.round(value / step), 5);
      await page.evaluate(() => window.musart!.undo());
      expect(await page.evaluate(() => JSON.stringify(window.musart!.snapshot().project))).toBe(
        before,
      );
      expect(await page.evaluate(() => window.musart!.snapshot().canUndo)).toBe(false);
      if (input) await expect(input).toHaveValue(mode === "scale" ? "1" : "0");
    }
    if (workspace === "classic") {
      await properties
        .locator(".spatial-accordion-body")
        .first()
        .screenshot({ path: "artifacts/spatial/transform-fields.png" });
      await properties.getByRole("button", { name: "Advanced", exact: true }).click();
      for (const width of [280, 480]) {
        const sidebar = (await page.locator(".sidebar").boundingBox())!;
        const resize = (await page.locator(".sidebar-resize").boundingBox())!;
        const x = resize.x + resize.width / 2,
          y = resize.y + resize.height / 2;
        await page.mouse.move(x, y);
        await page.mouse.down();
        await page.mouse.move(x + sidebar.width - width, y, { steps: 4 });
        await page.mouse.up();
        const geometry = await properties.evaluate((root) => {
          const rows = [...root.querySelectorAll(".spatial-axis-grid")].map((row) =>
            [...row.querySelectorAll("input")].map((input) => {
              const box = input.getBoundingClientRect();
              return { x: box.x, y: box.y, width: box.width };
            }),
          );
          const advanced = [...root.querySelectorAll(".spatial-advanced-grid input")].map(
            (input) => input.getBoundingClientRect().y,
          );
          const labels = [
            ...root.querySelectorAll<HTMLElement>(".spatial-advanced-grid .number-scrub"),
          ];
          return {
            rows,
            advanced,
            clipped: labels.some((label) => label.scrollHeight > label.clientHeight + 1),
          };
        });
        for (const row of geometry.rows) {
          expect(new Set(row.map((box) => Math.round(box.y))).size).toBe(1);
          expect(row.every((box) => box.width > 20)).toBe(true);
        }
        for (let column = 0; column < 3; column++) {
          const reference = geometry.rows[0]![column]!;
          for (const row of geometry.rows) {
            expect(row[column]!.x).toBeCloseTo(reference.x, 1);
            expect(row[column]!.width).toBeCloseTo(reference.width, 1);
          }
        }
        for (let i = 0; i < geometry.advanced.length; i += 2)
          expect(geometry.advanced[i]).toBeCloseTo(geometry.advanced[i + 1]!, 1);
        expect(geometry.clipped).toBe(false);
        const grid = properties.locator(".spatial-advanced-grid");
        await grid.screenshot({ path: `artifacts/spatial/properties-${width}.png` });
        await info.attach(`properties-${width}`, {
          path: `artifacts/spatial/properties-${width}.png`,
          contentType: "image/png",
        });
      }
    }
    expect(errors).toEqual([]);
  });
