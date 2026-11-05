import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { armStudioPresentation } from "./support/studio-presentation";
import { createEffect, type Project } from "../../packages/core/src/index";

async function openStudio(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("musart.language", "en");
    localStorage.setItem("musart.editor-tutorial.v1", "done");
  });
  await page.goto("/editor?automation=1&workspace=studio");
  await page.waitForFunction(() => !!window.musart, undefined, { timeout: 60000 });
  const manifest = JSON.parse(
    await readFile("apps/web/public/templates/designed/studio-starter/studio-starter.json", "utf8"),
  ) as { project: Project };
  await page.evaluate((project) => {
    window.musart!.load(project);
    window.musart!.select(["studio-title"]);
  }, manifest.project);
  await expect(page.locator("[data-studio-chrome]")).toBeVisible();
  await expect(page.locator(".editor-gpu-scene canvas")).toHaveAttribute(
    "data-renderer-ready",
    "true",
    { timeout: 60000 },
  );
}
async function workspace(page: Page, mode: "Classic" | "Studio") {
  await page.getByRole("button", { name: "Project actions", exact: true }).click();
  await page.getByRole("combobox", { name: "Workspace", exact: true }).click();
  await page.getByRole("option", { name: mode, exact: true }).click();
  await expect(page.locator("[data-workspace-mode]")).toHaveAttribute(
    "data-workspace-mode",
    mode.toLowerCase(),
  );
  await page.getByRole("button", { name: "Project actions", exact: true }).click();
}
const digest = (data: string) =>
  createHash("sha256")
    .update(Buffer.from(data.split(",")[1]!, "base64"))
    .digest("hex");

test("Studio retains the native canvas and byte-exact exports across mode switches; gestures, locks and export use canonical controls", async ({
  page,
}) => {
  test.setTimeout(180000);
  await mkdir("artifacts/studio", { recursive: true });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await openStudio(page);
  const canvas = await page.locator(".editor-gpu-scene canvas").elementHandle();
  const original = await page.evaluate(() => JSON.stringify(window.musart!.snapshot()));
  const image = await page.evaluate(() => window.musart!.render({ scale: 0.25, format: "png" }));
  const poster = await page.evaluate(() => window.musart!.render({ scale: 0.5, format: "webp" }));
  await writeFile(
    "artifacts/studio/studio-starter.webp",
    Buffer.from(poster.split(",")[1]!, "base64"),
  );
  await workspace(page, "Classic");
  expect(await page.evaluate(() => JSON.stringify(window.musart!.snapshot()))).toBe(original);
  expect(await canvas!.evaluate((node) => node.isConnected)).toBe(true);
  expect(
    await page.locator(".editor-gpu-scene canvas").evaluate((node, old) => node === old, canvas),
  ).toBe(true);
  const classic = await page.evaluate(() => window.musart!.render({ scale: 0.25, format: "png" }));
  expect(digest(classic)).toBe(digest(image));
  await workspace(page, "Studio");
  expect(await page.evaluate(() => JSON.stringify(window.musart!.snapshot()))).toBe(original);
  expect(await canvas!.evaluate((node) => node.isConnected)).toBe(true);
  await expect(
    page
      .getByRole("radiogroup", { name: "Editing mode", exact: true })
      .getByRole("radio", { name: "3D", exact: true }),
  ).toBeChecked();
  await page.keyboard.press("Control+k");
  await expect(page.locator(".magic-search-dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".magic-search-dialog")).toHaveCount(0);
  const editingMode = page.getByRole("radiogroup", { name: "Editing mode", exact: true });
  await editingMode.getByRole("radio", { name: "2D", exact: true }).click();
  await expect(editingMode.getByRole("radio", { name: "2D", exact: true })).toBeChecked();
  await editingMode.getByRole("radio", { name: "3D", exact: true }).click();
  const textField = page.locator(".studio-object-bar").getByRole("textbox");
  await textField.fill("Melt Studio");
  await textField.press("Enter");
  expect(
    await page.evaluate(
      () =>
        window
          .musart!.snapshot()
          .project.pages[0]!.layers.find((layer) => layer.id === "studio-title")!.text,
    ),
  ).toBe("Melt Studio");
  await page.evaluate(() => window.musart!.undo());
  const depth = page
    .locator(".studio-object-bar")
    .getByRole("slider", { name: "Depth", exact: true });
  const originalDepth = await page.evaluate(
    () =>
      window
        .musart!.snapshot()
        .project.pages[0]!.layers.find((layer) => layer.id === "studio-title")!.spatial!.depth,
  );
  await depth.focus();
  await page.keyboard.press("ArrowRight");
  expect(
    await page.evaluate(
      () =>
        window
          .musart!.snapshot()
          .project.pages[0]!.layers.find((layer) => layer.id === "studio-title")!.spatial!.depth,
    ),
  ).toBeCloseTo(originalDepth + 0.01);
  await page.evaluate(() => window.musart!.undo());
  await page.keyboard.press("Escape");
  const material = page.getByRole("region", { name: "Material", exact: true });
  await page
    .locator(".studio-material")
    .getByRole("button", { name: "Material", exact: true })
    .click();
  const slider = material.getByRole("slider", { name: "Roughness", exact: true });
  expect(
    await material
      .locator('.studio-slider [data-slot="slider-track"]')
      .first()
      .evaluate((node) => node.getBoundingClientRect().height),
  ).toBe(36);
  await page.screenshot({ path: "artifacts/studio/studio-material.png" });
  const before = await page.evaluate(() => ({
    project: JSON.stringify(window.musart!.snapshot().project),
    revision: window.musart!.session().revision,
    renders: [
      ...document.querySelectorAll(".musart-app,.canvas-area,.editor-canvas,.editor-gpu-scene"),
    ].map((node) => node.getAttribute("data-react-renders")),
  }));
  await armStudioPresentation(page);
  const box = (await material
    .locator('.studio-slider:has([aria-label="Roughness"]) [data-slot="slider-track"]')
    .boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.8, box.y + box.height / 2, { steps: 6 });
  expect(await page.evaluate(() => JSON.stringify(window.musart!.snapshot().project))).toBe(
    before.project,
  );
  expect(
    await page.evaluate(() =>
      [
        ...document.querySelectorAll(".musart-app,.canvas-area,.editor-canvas,.editor-gpu-scene"),
      ].map((node) => node.getAttribute("data-react-renders")),
    ),
  ).toEqual(before.renders);
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => window.__studioPresentation)).toBeTruthy();
  await writeFile(
    "artifacts/studio/slider-presentation.json",
    JSON.stringify(await page.evaluate(() => window.__studioPresentation), null, 2),
  );
  expect(await page.evaluate(() => window.musart!.session().revision)).toBe(before.revision + 1);
  await page.evaluate(() => window.musart!.undo());
  expect(await page.evaluate(() => JSON.stringify(window.musart!.snapshot().project))).toBe(
    before.project,
  );
  await slider.focus();
  await page.keyboard.press("ArrowRight");
  expect(
    await page.evaluate(
      () =>
        window.musart!.snapshot().project.pages[0]!.layers.find((l) => l.id === "studio-title")!
          .spatial!.material.roughness,
    ),
  ).toBeCloseTo(0.29);
  await page.evaluate(() => window.musart!.undo());
  await page.keyboard.press("Escape");
  await page.locator(".studio-compositions .studio-dock-heading").click();
  await expect(page.locator("[data-layers-presentation]")).toHaveAttribute("aria-busy", "false");
  await page.getByRole("button", { name: "Lock layer · MELT", exact: true }).click();
  await page.keyboard.press("Escape");
  await page.locator(".studio-material .studio-dock-heading").click();
  await expect(slider).toHaveAttribute("data-disabled");
  await page.keyboard.press("Escape");
  await page.locator(".studio-compositions .studio-dock-heading").click();
  await page.getByRole("button", { name: "Unlock layer · MELT", exact: true }).click();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await expect(page.locator(".export-dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".export-dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Background", exact: true }).click();
  await page.getByRole("button", { name: "Enable background effects", exact: true }).click();
  const background = await page.evaluate(
    () => window.musart!.snapshot().project.pages[0]!.layers[0]!,
  );
  expect(background).toMatchObject({ kind: "rectangle", x: 0, y: 0, width: 1920, height: 1080 });
  await page.keyboard.press("Escape");
  await page.evaluate(
    ({ id, effect }) =>
      window.musart!.execute({ type: "updateLayers", ids: [id], patch: { effects: [effect] } }),
    { id: background.id, effect: createEffect("blur", { id: "studio-bg-blur", amount: 0.2 }) },
  );
  await page.evaluate(() => window.musart!.save());
  await page
    .locator(".studio-material")
    .getByRole("button", { name: "Material", exact: true })
    .click();
  await page.screenshot({ path: "artifacts/studio/studio-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".studio-compositions .studio-dock-heading")).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  expect(await canvas!.evaluate((node) => node.isConnected)).toBe(true);
  await page.getByRole("button", { name: "Recenter view", exact: true }).click();
  await page.waitForTimeout(350);
  await page.screenshot({ path: "artifacts/studio/studio-mobile.png" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const controls = await page
    .locator(".studio-quick-add,.studio-actions,.studio-background-dock,.studio-agent-anchor")
    .evaluateAll((nodes) =>
      nodes.map((node) => ({
        x: node.getBoundingClientRect().x,
        right: node.getBoundingClientRect().right,
      })),
    );
  for (const control of controls) {
    expect(control.x).toBeGreaterThanOrEqual(0);
    expect(control.right).toBeLessThanOrEqual(390);
  }
  expect(errors).toEqual([]);
});

test("Studio downloads its optional library explicitly, imports editable SVGs and preserves live authenticated agent activity across workspaces", async ({
  page,
}) => {
  test.setTimeout(180000);
  let requests = 0;
  page.on("request", (request) => {
    if (request.url().includes("/spatial/packs/")) requests++;
  });
  await openStudio(page);
  expect(requests).toBe(0);
  await page.getByRole("button", { name: "3D", exact: true }).click();
  const library = page.locator(".spatial-library");
  await library.getByRole("radio", { name: "SVG", exact: true }).click();
  const vectorCount = await page.evaluate(
    () => window.musart!.snapshot().project.pages[0]!.layers.length,
  );
  await library.getByRole("button", { name: /^Use / }).first().click();
  await expect
    .poll(() => page.evaluate(() => window.musart!.snapshot().project.pages[0]!.layers.length))
    .toBe(vectorCount + 1);
  expect(
    await page.evaluate(
      () => window.musart!.snapshot().project.pages[0]!.layers.at(-1)!.spatial?.source,
    ),
  ).toBe("extrude");
  await library.getByRole("radio", { name: "Packs", exact: true }).click();
  expect(requests).toBe(0);
  await library.getByRole("button", { name: /Download ·/ }).click();
  await expect(library.getByText("Available offline", { exact: true })).toBeVisible({
    timeout: 60000,
  });
  expect(requests).toBe(2);
  await expect(library.locator(".spatial-library-preview")).toHaveAttribute("data-ready", "true", {
    timeout: 30000,
  });
  await page.context().setOffline(true);
  await library.getByRole("button", { name: "Add model", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () => window.musart!.snapshot().project.pages[0]!.layers.at(-1)!.spatial?.source,
      ),
    )
    .toBe("glb");
  await page.context().setOffline(false);
  await page.keyboard.press("Escape");
  const relay = spawn("bun", ["scripts/agent-bridge/server.ts"], {
    env: { ...process.env, MELT_AGENT_PORT: "6215" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  relay.stdout.on("data", (chunk) => {
    output += chunk.toString();
  });
  let agent: WebSocket | undefined;
  try {
    await expect.poll(() => /Pairing token: ([a-f0-9]{64})/.exec(output)?.[1]).toBeTruthy();
    const token = /Pairing token: ([a-f0-9]{64})/.exec(output)![1]!;
    const rejected = await fetch("http://127.0.0.1:6215/", {
      headers: { Origin: "https://untrusted.invalid" },
    });
    expect(rejected.status).toBe(403);
    await page.evaluate(({ token }) => window.musart!.agentConnect("ws://127.0.0.1:6215/", token), {
      token,
    });
    await expect
      .poll(() => page.evaluate(() => window.musart!.agentStatus().status))
      .toBe("connected");
    agent = new WebSocket("ws://127.0.0.1:6215/");
    await new Promise<void>((resolve, reject) => {
      agent!.onopen = () => resolve();
      agent!.onerror = () => reject(Error("Agent connection failed"));
    });
    const inbox: Record<string, unknown>[] = [];
    agent.onmessage = (event) =>
      inbox.push(JSON.parse(String(event.data)) as Record<string, unknown>);
    agent.send(JSON.stringify({ kind: "hello", version: 1, role: "agent", token }));
    await expect
      .poll(() => page.evaluate(() => window.musart!.agentStatus().peerConnected))
      .toBe(true);
    const session = await page.evaluate(() => window.musart!.session());
    const expected = {
      projectId: session.projectId,
      pageId: session.pageId,
      revision: session.revision,
    };
    agent.send(
      JSON.stringify({
        kind: "request",
        id: "edit-1",
        operation: "execute",
        expected,
        command: {
          type: "updateLayers",
          ids: ["studio-title"],
          patch: { text: "Live with your agent" },
        },
      }),
    );
    await expect.poll(() => inbox.find((message) => message.id === "edit-1")?.ok).toBe(true);
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            window
              .musart!.snapshot()
              .project.pages[0]!.layers.find((layer) => layer.id === "studio-title")!.text,
        ),
      )
      .toBe("Live with your agent");
    agent.send(JSON.stringify({ kind: "request", id: "stale-1", operation: "undo", expected }));
    await expect.poll(() => inbox.find((message) => message.id === "stale-1")?.ok).toBe(false);
    await workspace(page, "Classic");
    expect(await page.evaluate(() => window.musart!.agentStatus().status)).toBe("connected");
    await workspace(page, "Studio");
    expect(
      await page.evaluate(() =>
        window.musart!.agentStatus().logs.some((entry) => entry.source === "agent" && entry.ok),
      ),
    ).toBe(true);
    await expect(page.locator(".studio-agent-anchor")).toHaveCount(0);
  } finally {
    await page.evaluate(() => window.musart?.agentDisconnect());
    agent?.close();
    relay.kill("SIGTERM");
  }
});

test("Studio starter installs through the real gallery and restores its presentation preference after reload", async ({
  page,
}) => {
  test.setTimeout(120000);
  await page.addInitScript(() => {
    localStorage.setItem("musart.language", "en");
    localStorage.setItem("musart.editor-tutorial.v1", "done");
  });
  await page.goto("/dashboard?automation=1");
  await page.getByRole("button", { name: "Create from Studio Starter", exact: true }).click();
  await page.waitForFunction(
    () => window.musart?.snapshot().project.name === "Studio Starter",
    undefined,
    { timeout: 20000 },
  );
  await expect(page.locator("[data-workspace-mode]")).toHaveAttribute(
    "data-workspace-mode",
    "studio",
  );
  const source = await page.evaluate(() => window.musart!.snapshot().project);
  expect(source.id).not.toBe("template-studio-starter");
  await page.evaluate(() => window.musart!.save());
  await page.goto(`/editor?project=${encodeURIComponent(source.id)}&automation=1`);
  await page.waitForFunction((id) => window.musart?.session().projectId === id, source.id, {
    timeout: 60000,
  });
  await expect(page.locator("[data-workspace-mode]")).toHaveAttribute(
    "data-workspace-mode",
    "studio",
  );
  expect(await page.evaluate(() => window.musart!.snapshot().project.pages)).toEqual(source.pages);
  await workspace(page, "Classic");
  await page.evaluate(() => window.musart!.save());
  await page.reload();
  await page.waitForFunction((id) => window.musart?.session().projectId === id, source.id, {
    timeout: 60000,
  });
  await expect(page.locator("[data-workspace-mode]")).toHaveAttribute(
    "data-workspace-mode",
    "classic",
  );
  expect(await page.evaluate(() => window.musart!.snapshot().project.pages)).toEqual(source.pages);
});
