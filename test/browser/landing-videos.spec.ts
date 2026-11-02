import { expect, test } from "@playwright/test";

test("real visible clips decode under one bounded budget; offscreen timelapse stays lazy", async ({
  page,
}) => {
  const requests: string[] = [];
  page.on("request", (request) => requests.push(request.url()));
  await page.goto("/");
  await expect(page.locator("video[data-landing-video]")).toHaveCount(9);
  await expect(
    page.locator(".landing-template-stage > video[data-video-ready]").first(),
  ).toBeVisible();
  const geometry = await page
    .locator(".landing-template-stage")
    .first()
    .evaluate((stage) => {
      const image = stage.querySelector("img")!,
        video = stage.querySelector("video")!;
      const box = stage.getBoundingClientRect(),
        picture = image.getBoundingClientRect(),
        frame = video.getBoundingClientRect();
      return {
        width: box.width,
        imageWidth: picture.width,
        videoWidth: frame.width,
        height: box.height,
        imageHeight: picture.height,
        videoHeight: frame.height,
        radius: getComputedStyle(stage).borderRadius,
        imageRadius: getComputedStyle(image).borderRadius,
        videoRadius: getComputedStyle(video).borderRadius,
      };
    });
  expect(geometry.imageWidth).toBeGreaterThan(geometry.width * 0.88);
  expect(geometry.imageWidth).toBeLessThanOrEqual(geometry.width);
  expect(geometry.videoWidth).toBeCloseTo(geometry.imageWidth, 0);
  expect(geometry.imageHeight).toBeLessThanOrEqual(geometry.height);
  expect(geometry.videoHeight).toBeCloseTo(geometry.imageHeight, 0);
  expect(geometry.imageRadius).toBe(geometry.radius);
  expect(geometry.videoRadius).toBe(geometry.radius);
  const bubbles = await page.locator(".landing-template-stage").evaluateAll((nodes) =>
    nodes.map((node) => {
      const box = node.getBoundingClientRect();
      return [box.width, box.height];
    }),
  );
  for (const [width, height] of bubbles) {
    expect(width).toBeCloseTo(geometry.width, 0);
    expect(height).toBeCloseTo(geometry.height, 0);
  }
  const playing = () =>
    page
      .locator("video[data-landing-video]")
      .evaluateAll((nodes) => nodes.filter((node) => !(node as HTMLVideoElement).paused).length);
  expect(await playing()).toBeLessThanOrEqual(2);
  expect(
    requests.filter((url) => url.includes("feature-timelapse") && url.endsWith(".webm")),
  ).toEqual([]);
  expect(
    requests.filter((url) =>
      /\/(Studio|App|EditorCanvas|three\.(core|webgpu))-[^/]+\.js/.test(url),
    ),
  ).toEqual([]);
  await expect
    .poll(() =>
      page
        .locator(".landing-template-stage > video[data-video-ready]")
        .first()
        .evaluate((node: HTMLVideoElement) => node.currentTime),
    )
    .toBeGreaterThan(0.1);
  const timelapse = page.locator('[data-feature="timelapse"] video');
  await timelapse.scrollIntoViewIfNeeded();
  await expect(timelapse).toHaveAttribute("data-video-ready", "true");
  expect(await playing()).toBeLessThanOrEqual(2);
  expect(await page.locator("video[data-landing-video][src]").count()).toBeLessThanOrEqual(3);
  expect(await timelapse.evaluate((video: HTMLVideoElement) => video.loop)).toBe(false);
  await timelapse.evaluate((video: HTMLVideoElement) => {
    video.currentTime = video.duration - 0.1;
  });
  await expect.poll(() => timelapse.evaluate((video: HTMLVideoElement) => video.ended)).toBe(true);
  await page.waitForTimeout(1500);
  expect(await timelapse.evaluate((video: HTMLVideoElement) => video.ended)).toBe(true);
  await expect
    .poll(() => timelapse.evaluate((video: HTMLVideoElement) => video.currentTime), {
      timeout: 2000,
    })
    .toBeLessThan(1.5);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect.poll(playing).toBe(0);
});

test("all seven cards retain real dialog links and reduced motion downloads only posters", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const media: string[] = [];
  page.on("request", (request) => {
    if (request.url().endsWith(".webm")) media.push(request.url());
  });
  await page.goto("/");
  const links = await page
    .locator(".landing-template-card")
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("href")));
  expect(links).toEqual(
    [
      "morphing-type",
      "bloom-windows",
      "cornell-box",
      "angel-windows",
      "terminal-signal",
      "second-skin",
      "share-your-work",
    ].map((id) => `/dashboard?preview=template&item=${id}`),
  );
  await page.locator('[data-feature="timelapse"]').scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  expect(media).toEqual([]);
  await expect(page.locator("video[data-landing-video][src]")).toHaveCount(0);
});

test("Try Melt reveals the dashboard from the native pointer using transform animation", async ({
  page,
}) => {
  await page.goto("/");
  const cdp = await page.context().newCDPSession(page);
  let layers: { layerId: string; backendNodeId?: number }[] = [];
  cdp.on("LayerTree.layerTreeDidChange", (event: { layers?: typeof layers }) => {
    layers = event.layers ?? [];
  });
  await cdp.send("LayerTree.enable");
  await cdp.send("Animation.enable");
  // Slow only this diagnostic animation so compositor reasons can be inspected reliably.
  await cdp.send("Animation.setPlaybackRate", { playbackRate: 0.1 });
  const button = page.locator(".site-try");
  const box = (await button.boundingBox())!;
  const x = box.x + box.width / 2,
    y = box.y + box.height / 2;
  await page.mouse.click(x, y);
  const surface = page.locator('[data-opening-phase="navigation"]');
  await expect(surface).toBeAttached();
  expect(Number(await surface.getAttribute("data-origin-x"))).toBeCloseTo(x, 0);
  expect(Number(await surface.getAttribute("data-origin-y"))).toBeCloseTo(y, 0);
  await expect(surface.locator('.ui-throbber[data-variant="shimmer"]')).toBeVisible();
  const throbber = await surface.locator(".ui-throbber").evaluate((node) => {
    const mark = node.querySelector(".ui-throbber-mark")!.getBoundingClientRect();
    const label = node.querySelector(".ui-throbber-label")!.getBoundingClientRect();
    return { size: mark.width, gap: label.top - mark.bottom };
  });
  expect(throbber.size).toBe(80);
  expect(throbber.gap).toBeGreaterThanOrEqual(18);
  await expect(surface.locator(".ui-throbber-mark")).toHaveCSS("filter", "none");
  await expect(surface.locator(".ui-throbber-label")).toHaveCSS(
    "animation-name",
    "melt-text-shimmer",
  );
  const properties = await surface
    .locator(".project-opening-circle")
    .evaluate((node) =>
      node
        .getAnimations()
        .flatMap((animation) =>
          (animation.effect as KeyframeEffect)
            .getKeyframes()
            .flatMap((frame) => Object.keys(frame)),
        ),
    );
  expect(properties).toContain("transform");
  expect(properties).not.toContain("clipPath");
  const { root } = await cdp.send("DOM.getDocument");
  const { nodeId } = await cdp.send("DOM.querySelector", {
    nodeId: root.nodeId,
    selector: ".project-opening-circle",
  });
  const { node } = await cdp.send("DOM.describeNode", { nodeId });
  const layer = layers.find((entry) => entry.backendNodeId === node.backendNodeId);
  expect(layer).toBeDefined();
  const reasons = await cdp.send("LayerTree.compositingReasons", { layerId: layer!.layerId });
  expect(reasons.compositingReasons.some((reason: string) => /transform/i.test(reason))).toBe(true);
  await test.info().attach("transition-compositing", {
    body: JSON.stringify(reasons),
    contentType: "application/json",
  });
  await cdp.send("Animation.setPlaybackRate", { playbackRate: 1 });
  await expect(page.locator(".project-dashboard")).toBeVisible();
  await expect(surface).toHaveCount(0);
  await expect(page).toHaveURL(/\/dashboard$/);
});

test("a carousel card opens its associated dialog, then Open in Melt keeps the shared reveal", async ({
  page,
}) => {
  await page.goto("/");
  const card = page.locator(".landing-template-card").first();
  await page.locator(".landing-showcase-scroll").hover();
  await card.scrollIntoViewIfNeeded();
  const box = (await card.boundingBox())!;
  await page.mouse.click(Math.max(10, box.x + box.width / 2), box.y + 40);
  const dialog = page.locator(".library-item-dialog");
  await expect(dialog).toBeVisible({ timeout: 30000 });
  await expect(page).toHaveURL(/\/dashboard\?preview=template&item=morphing-type$/);
  await expect(page.locator(".project-opening-surface")).toHaveCount(0);
  const open = dialog.getByRole("button", { name: "Open in Melt", exact: true });
  const openBox = (await open.boundingBox())!;
  await page.mouse.click(openBox.x + openBox.width / 2, openBox.y + openBox.height / 2);
  await expect(
    page.locator(
      '.project-opening-surface[data-opening-phase="installing"], .project-opening-surface[data-opening-phase="canvas"]',
    ),
  ).toBeAttached();
  await expect(
    page.locator('.editor-gpu-scene canvas[data-presentation-ready="true"]'),
  ).toBeVisible({ timeout: 30000 });
  await expect(page.locator(".project-opening-surface")).toHaveCount(0, { timeout: 30000 });
});

test("native link dragging pans, pointer hover pauses, and leaving resumes the visible rail", async ({
  page,
}) => {
  await page.goto("/");
  const rail = page.locator(".landing-showcase-scroll");
  await rail.scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => matchMedia("(hover: hover) and (pointer: fine)").matches)).toBe(
    true,
  );
  await rail.hover();
  await expect(rail).not.toHaveAttribute("data-carousel-auto");
  const box = (await rail.boundingBox())!;
  const position = await rail.getAttribute("data-carousel-position");
  await page.mouse.move(box.x + box.width * 0.6, box.y + 60);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.6 - 160, box.y + 62, { steps: 12 });
  await expect(rail).toHaveAttribute("data-dragging", "true");
  await page.mouse.up();
  await expect(rail).not.toHaveAttribute("data-carousel-position", position!);
  await expect(page).toHaveURL(/\/$/);
  await page.mouse.move(8, 8);
  await expect(rail).toHaveAttribute("data-carousel-auto", "", { timeout: 5000 });
  await page.locator("#faq").scrollIntoViewIfNeeded();
  await expect(rail).not.toHaveAttribute("data-carousel-auto");
  await expect(rail).not.toHaveAttribute("data-carousel-moving");
});

test("feature illustrations are native themed artwork and the supplied effects image is decoded", async ({
  page,
  context,
  baseURL,
}) => {
  await context.addCookies([{ name: "musart.language", value: "fr", url: baseURL! }]);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.locator("[data-feature-ui]")).toHaveCount(3);
  const image = page.locator('[data-feature="effects"] .landing-feature-artwork > img');
  await image.scrollIntoViewIfNeeded();
  await expect(image).toHaveJSProperty("naturalWidth", 960);
  for (const theme of ["light", "dark"]) {
    await page.evaluate(
      (dark) => document.documentElement.classList.toggle("dark", dark),
      theme === "dark",
    );
    for (const kind of ["canvas", "agent", "export"]) {
      const card = page.locator(`[data-feature="${kind}"]`);
      await card.scrollIntoViewIfNeeded();
      await expect(card.locator(".real-feature")).toBeVisible();
      if (kind === "export") {
        await expect(card.locator(".real-feature-export-window")).toContainText("Export video");
        await expect(card.locator(".real-feature-export-field").first()).toContainText("1×");
      }
      if (kind === "agent") {
        await expect(card.locator(".real-feature-command-footer")).toHaveCount(0);
        const fit = await card.locator(".real-feature-agent-artwork").evaluate((frame) => {
          const box = frame.getBoundingClientRect(),
            image = frame.querySelector("img")!.getBoundingClientRect();
          return { width: box.width - image.width, height: box.height - image.height };
        });
        expect(Math.abs(fit.width)).toBeLessThan(1);
        expect(Math.abs(fit.height)).toBeLessThan(1);
      }
      await card.screenshot({ path: test.info().outputPath(`${kind}-${theme}.png`) });
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  for (const kind of ["canvas", "agent", "export"]) {
    await page
      .locator(`[data-feature="${kind}"]`)
      .screenshot({ path: test.info().outputPath(`${kind}-mobile.png`) });
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});

test("shared loading text shimmers continuously while the mascot keeps its color", async ({
  page,
}) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(/\/Studio-[^/?]+\.js(?:\?|$)/, async (route) => {
    await gate;
    await route.continue();
  });
  try {
    await page.goto("/");
    await page.locator(".site-try").click();
    const surface = page.locator('[data-opening-phase="navigation"]');
    await expect(surface.locator(".project-opening-body")).toHaveCSS("opacity", "1");
    await expect(surface.locator('.melt-mark[data-ready="true"]')).toBeVisible();
    const label = surface.locator(".ui-throbber-label");
    const colors = await surface.locator(".ui-throbber").evaluate((host) => {
      const mark = host.querySelector(".ui-throbber-mark")!;
      return { gray: getComputedStyle(host).color, violet: getComputedStyle(mark).color };
    });
    expect(colors.gray).not.toBe(colors.violet);
    const mark = surface.locator(".ui-throbber-mark");
    const positions: string[] = [];
    for (const [time, phase] of [
      [0, "start"],
      [1400, "middle"],
    ] as const) {
      await label.evaluate((node, currentTime) => {
        const pulse = node
          .getAnimations()
          .find((animation) => (animation as CSSAnimation).animationName === "melt-text-shimmer");
        if (!pulse) throw Error("Original loading text shimmer is missing.");
        pulse.pause();
        pulse.currentTime = currentTime;
      }, time);
      await expect(label).toHaveCSS("color", "rgba(0, 0, 0, 0)");
      await expect(label).toHaveCSS("background-clip", "text");
      const paint = await label.evaluate((node) => {
        const style = getComputedStyle(node);
        return { gradient: style.backgroundImage, position: style.backgroundPositionX };
      });
      expect(paint.gradient).toContain("linear-gradient");
      expect(paint.gradient).toContain(colors.gray);
      expect(paint.gradient).toContain(colors.violet);
      positions.push(paint.position);
      await expect(mark).toHaveCSS("color", colors.violet);
      await expect(mark).toHaveCSS("filter", "none");
      await expect(mark).toHaveCSS("animation-name", "none");
      await surface
        .locator(".ui-throbber")
        .screenshot({ path: test.info().outputPath(`loading-${phase}.png`) });
    }
    expect(positions[0]).not.toBe(positions[1]);
    const rest = await label.evaluate((node) => {
      const animation = node.getAnimations()[0]!;
      animation.currentTime = 2400;
      const end = getComputedStyle(node).backgroundPositionX;
      animation.currentTime = 2900;
      return { end, rest: getComputedStyle(node).backgroundPositionX };
    });
    expect(rest.end).not.toBe(rest.rest);
    const geometry = await surface.locator(".ui-throbber").evaluate((host) => {
      const mark = host.querySelector(".ui-throbber-mark")!.getBoundingClientRect(),
        label = host.querySelector(".ui-throbber-label")!.getBoundingClientRect();
      return {
        center: mark.x + mark.width / 2,
        viewport: innerWidth / 2,
        gap: label.top - mark.bottom,
      };
    });
    expect(geometry.center).toBeCloseTo(geometry.viewport, 0);
    expect(geometry.gap).toBeGreaterThanOrEqual(18);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(label).toHaveCSS("animation-name", "none");
    await expect(label).toHaveCSS("color", colors.gray);
    await expect(label).toHaveCSS("background-image", "none");
    release();
    await expect(page.locator(".project-dashboard")).toBeVisible();
    await expect(surface).toHaveCount(0);
  } finally {
    release();
  }
});
