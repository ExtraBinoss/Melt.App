import { expect, test } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { preparePaletteProfile, paletteSelector, closePalette } from "./support/palette-profile";

test.use({
  trace: "off",
  screenshot: "off",
  video: "off",
  channel: "chromium",
  headless: process.env.MUSART_PROFILE_HEADED !== "1",
});
interface PositionSample {
  at: number;
  values: { id: string; x: number; y: number; transform: string }[];
}
interface Stability {
  samples: PositionSample[];
  done: boolean;
}

for (const kind of ["quick-add", "cmdk"] as const)
  test(`${kind}: Chrome for Testing keeps glyph positions fixed and presents the blur while JavaScript is blocked`, async ({
    page,
    context,
    browser,
  }) => {
    test.setTimeout(60000);
    const directory = "artifacts/quick-add-search-profile/compositor";
    await mkdir(directory, { recursive: true });
    const { point } = await preparePaletteProfile(page, "studio", kind),
      selector = paletteSelector(kind);
    await page.evaluate((selector) => {
      const probe: Stability = { samples: [], done: false };
      Object.assign(window, { paletteStability: probe });
      const observer = new MutationObserver(() => {
        const panel = document.querySelector<HTMLElement>(selector);
        if (!panel || panel.dataset.searchReveal !== "running") return;
        observer.disconnect();
        const start = performance.now();
        const sample = () => {
          probe.samples.push({
            at: performance.now(),
            values: [...panel.querySelectorAll<HTMLElement>('[role="option"]')]
              .slice(0, 7)
              .map((row) => {
                const label = row.querySelector(
                  ".quick-add-item-label > span, .magic-search-item-copy > span",
                )!;
                const range = document.createRange();
                range.selectNodeContents(label);
                const bounds = range.getBoundingClientRect();
                return {
                  id: row.getAttribute("data-value")!,
                  x: bounds.x,
                  y: bounds.y,
                  transform: getComputedStyle(row).transform,
                };
              }),
          });
          if (performance.now() - start < 800) requestAnimationFrame(sample);
          else probe.done = true;
        };
        requestAnimationFrame(sample);
      });
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["data-search-reveal"],
      });
    }, selector);
    const cdp = await context.newCDPSession(page);
    let layers: { layerId: string; backendNodeId?: number }[] = [],
      blocking = false;
    const captures: string[] = [];
    cdp.on("LayerTree.layerTreeDidChange", (event) => {
      layers = event.layers ?? [];
    });
    cdp.on("Page.screencastFrame", (event) => {
      if (blocking) captures.push(event.data);
      void cdp.send("Page.screencastFrameAck", { sessionId: event.sessionId });
    });
    page.on("console", (message) => {
      if (message.text() === "palette-block-start") blocking = true;
      if (message.text() === "palette-block-end") blocking = false;
    });
    await cdp.send("LayerTree.enable");
    await cdp.send("Page.startScreencast", {
      format: "png",
      maxWidth: 1000,
      maxHeight: 800,
      everyNthFrame: 1,
    });
    if (kind === "quick-add") await page.mouse.dblclick(point.x, point.y);
    else await page.keyboard.press("Control+k");
    await page.waitForFunction(
      (selector) =>
        document.querySelector<HTMLElement>(selector)?.dataset.searchReveal === "running",
      selector,
    );
    const { root } = await cdp.send("DOM.getDocument", { depth: 0 });
    const { nodeIds } = await cdp.send("DOM.querySelectorAll", {
      nodeId: root.nodeId,
      selector: `${selector}, ${selector} .blur-reveal[data-blur-order="0"]`,
    });
    const backendIds = new Set(
      await Promise.all(
        nodeIds.map(
          async (nodeId) => (await cdp.send("DOM.describeNode", { nodeId })).node.backendNodeId,
        ),
      ),
    );
    const reasons = await Promise.all(
      layers
        .filter((layer) => layer.backendNodeId && backendIds.has(layer.backendNodeId))
        .map(async (layer) => {
          try {
            return await cdp.send("LayerTree.compositingReasons", { layerId: layer.layerId });
          } catch {
            return null;
          }
        }),
    );
    const clip = (await page.locator(selector).boundingBox())!;
    await page.waitForFunction(
      () => (window as unknown as { paletteStability: Stability }).paletteStability.done,
    );
    await closePalette(page, kind);
    // Start the blocking witness from the actual entrance signal. CDP DOM/layer
    // inspection above can otherwise consume the whole short animation first.
    await page.evaluate((selector) => {
      Object.assign(window, { paletteBlockDone: false });
      const observer = new MutationObserver(() => {
        if (document.querySelector<HTMLElement>(selector)?.dataset.searchReveal !== "running")
          return;
        observer.disconnect();
        // Let the positioned popover paint once before blocking its main thread.
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            console.log("palette-block-start");
            const until = performance.now() + 300;
            while (performance.now() < until) {
              /* Deliberate fixture task; never production. */
            }
            console.log("palette-block-end");
            Object.assign(window, { paletteBlockDone: true });
          }),
        );
      });
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["data-search-reveal"],
      });
    }, selector);
    if (kind === "quick-add") await page.mouse.dblclick(point.x, point.y);
    else await page.keyboard.press("Control+k");
    await page.waitForFunction(
      () => (window as unknown as { paletteBlockDone: boolean }).paletteBlockDone,
    );
    await cdp.send("Page.stopScreencast");
    await writeFile(
      `${directory}/${kind}-capture-state.json`,
      JSON.stringify(
        {
          capturedFrames: captures.length,
          state: await page.evaluate(
            (selector) => ({
              visibility: document.visibilityState,
              focused: document.hasFocus(),
              animations: document
                .querySelector(selector)
                ?.getAnimations()
                .map((animation) => ({
                  playState: animation.playState,
                  currentTime: animation.currentTime,
                })),
            }),
            selector,
          ),
        },
        null,
        2,
      ),
    );
    if (captures[0])
      await writeFile(`${directory}/${kind}-first-capture.png`, Buffer.from(captures[0], "base64"));
    expect(captures.length).toBeGreaterThan(1);
    await page.waitForFunction(
      () => (window as unknown as { paletteStability: Stability }).paletteStability.done,
    );
    const samples = await page.evaluate(
      () => (window as unknown as { paletteStability: Stability }).paletteStability.samples,
    );
    const first = new Map(samples[0]!.values.map((item) => [item.id, item]));
    let movement = 0;
    for (const sample of samples)
      for (const item of sample.values) {
        const original = first.get(item.id)!;
        movement = Math.max(movement, Math.abs(item.x - original.x), Math.abs(item.y - original.y));
        expect(item.transform).toBe("none");
      }
    expect(movement, "text must not reposition when the compositor layer retires").toBeLessThan(
      0.5,
    );
    const inspector = await context.newPage();
    let changed = 0;
    try {
      changed = await inspector.evaluate(
        async ({ captures, clip, viewport }) => {
          const decode = async (png: string) => {
            const image = new Image();
            image.src = `data:image/png;base64,${png}`;
            await image.decode();
            const canvas = document.createElement("canvas");
            canvas.width = image.width;
            canvas.height = image.height;
            const context = canvas.getContext("2d")!;
            context.drawImage(image, 0, 0);
            const scale = image.width / viewport;
            return context.getImageData(
              Math.floor(clip.x * scale),
              Math.floor(clip.y * scale),
              Math.floor(clip.width * scale),
              Math.floor(clip.height * scale),
            ).data;
          };
          const first = await decode(captures[0]!);
          let maximum = 0;
          for (const capture of captures.slice(1)) {
            const next = await decode(capture);
            let different = 0;
            for (let i = 0; i < first.length; i += 4)
              if (
                Math.abs(first[i]! - next[i]!) +
                  Math.abs(first[i + 1]! - next[i + 1]!) +
                  Math.abs(first[i + 2]! - next[i + 2]!) >
                8
              )
                different++;
            maximum = Math.max(maximum, different);
          }
          return maximum;
        },
        { captures, clip, viewport: page.viewportSize()!.width },
      );
    } finally {
      await inspector.close();
    }
    expect(changed).toBeGreaterThan(100);
    await page.bringToFront();
    const palette = page.locator(selector),
      input = palette.getByRole("combobox");
    await input.fill("blur");
    await expect(palette).toHaveAttribute("data-palette-initial", "false");
    await input.fill("");
    await palette.getByRole("button", { name: "Tools", exact: true }).click();
    await expect(palette.getByRole("option", { name: /^Hand/ })).toBeVisible();
    expect(
      await palette
        .locator(".blur-reveal")
        .evaluateAll((nodes) =>
          nodes.every(
            (node) =>
              node.getAnimations().length === 0 && Number(getComputedStyle(node).opacity) >= 0.48,
          ),
        ),
    ).toBe(true);
    await palette.screenshot({ path: `${directory}/${kind}-settled.png` });
    await closePalette(page, kind);
    await page.emulateMedia({ reducedMotion: "reduce" });
    if (kind === "quick-add") await page.mouse.dblclick(point.x, point.y);
    else await page.keyboard.press("Control+k");
    await expect(page.locator(selector).getByRole("combobox")).toBeFocused();
    expect(
      await page
        .locator(selector)
        .locator(".blur-reveal")
        .evaluateAll((nodes) => nodes.every((node) => node.getAnimations().length === 0)),
    ).toBe(true);
    await closePalette(page, kind);
    await cdp.detach();
    if (kind === "quick-add") {
      await page.evaluate(() =>
        window.musart!.execute({ type: "setCompositionMode", mode: "motion" }),
      );
      await page.locator(".studio-environment .studio-sphere-trigger").click();
      const settings = page.locator(".studio-sphere-content .studio-sphere-properties");
      await expect(settings.locator(".scene-animations-heading")).toHaveCount(2);
      for (const heading of await settings.locator(".scene-animations-heading").all()) {
        const title = heading.locator("h3"),
          button = heading.locator("button");
        await expect(title.locator("svg")).toHaveCount(0);
        await expect(title).toHaveCSS("font-size", "12px");
        const text = (await title.boundingBox())!,
          add = (await button.boundingBox())!;
        expect(Math.abs(text.y + text.height / 2 - add.y - add.height / 2)).toBeLessThan(1);
      }
      await settings.screenshot({ path: `${directory}/scene-animation-headings.png` });
      await page.keyboard.press("Escape");
    }
    for (const [index, capture] of [
      captures[0]!,
      captures[Math.floor(captures.length / 2)]!,
      captures.at(-1)!,
    ].entries())
      await writeFile(`${directory}/${kind}-blocked-${index}.png`, Buffer.from(capture, "base64"));
    await writeFile(
      `${directory}/${kind}.json`,
      JSON.stringify(
        {
          browser: browser.version(),
          headed: process.env.MUSART_PROFILE_HEADED === "1",
          blockedMs: 300,
          capturedFrames: captures.length,
          changedPixels: changed,
          maxTextMovementPx: movement,
          compositingReasons: reasons,
          samples,
        },
        null,
        2,
      ),
    );
  });
