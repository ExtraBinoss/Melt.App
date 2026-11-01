import { expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createLayer, createPage, createProject } from "@musart/core";
import { installReadbackProbe } from "./readback-probe";
export interface HoverSample {
  label: string;
  generated: number;
  dispatched: number;
  presented: number;
  inputDelayMs: number;
  hoverPresentationOpportunityMs?: number;
  inputToPresentationOpportunityMs: number;
  commits: Record<string, number>;
}
declare global {
  interface Window {
    __effectMenuHover?: { sample?: HoverSample; cancel(): void };
    __effectMenuDomReads?: { reads: number; supported: boolean; restore(): void };
  }
}
export async function photoMenuFixture(page: Page, selected = true) {
  await installReadbackProbe(page);
  await page.addInitScript(() => {
    localStorage.setItem("musart.language", "fr");
    localStorage.setItem("musart.onboarding.v1", JSON.stringify({ version: 1, completed: true }));
  });
  await page.goto("/editor?automation=1");
  await page.waitForFunction(() => !!window.musart);
  const bytes = await readFile("apps/web/public/benchmark/50-waterfall-5.jpg");
  const dataUrl = `data:image/jpeg;base64,${bytes.toString("base64")}`;
  const size = await page.evaluate(async (dataUrl) => {
    const image = new Image();
    image.src = dataUrl;
    await image.decode();
    return { width: image.naturalWidth, height: image.naturalHeight };
  }, dataUrl);
  const project = createProject({
    id: "effect-menu-photo",
    name: "Photographic add-menu witness",
    assets: { photo: { id: "photo", name: "Photo", mime: "image/jpeg", ...size, dataUrl } },
    pages: [
      createPage({
        id: "photo-page",
        width: 1920,
        height: 1080,
        layers: [
          createLayer("image", {
            id: "photo-layer",
            assetId: "photo",
            x: 100,
            y: 100,
            width: 900,
            height: 600,
          }),
        ],
      }),
    ],
  });
  // Open a persisted image project in a fresh document: the automation demo must not
  // leave unrelated font preparation competing with the measured menu.
  await page.evaluate(async (project) => {
    window.musart!.load(project);
    await window.musart!.save();
  }, project);
  await page.goto(`/editor?project=${project.id}&automation=1`);
  await page.waitForFunction(() => window.musart?.session().projectId === "effect-menu-photo");
  if (selected) await page.evaluate(() => window.musart!.select(["photo-layer"]));
  await page.waitForFunction(() => {
    const data = document.querySelector<HTMLCanvasElement>(".editor-gpu-scene canvas")?.dataset;
    return (
      data?.projectId === "effect-menu-photo" &&
      data.rendererReady === "true" &&
      data.sceneRevision === data.renderedRevision
    );
  });
  const thumbnail = page
    .locator('[data-layer-id="photo-layer"] img:not([data-thumbnail-previous])')
    .first();
  await expect(thumbnail).toBeVisible();
  await thumbnail.evaluate((image: HTMLImageElement) => image.decode());
  await page.evaluate(() => {
    const descriptor = Object.getOwnPropertyDescriptor(Node.prototype, "textContent");
    const probe = {
      reads: 0,
      supported: !!descriptor?.get,
      restore() {
        if (descriptor) Object.defineProperty(Node.prototype, "textContent", descriptor);
      },
    };
    window.__effectMenuDomReads = probe;
    if (descriptor?.get)
      Object.defineProperty(Node.prototype, "textContent", {
        ...descriptor,
        get(this: Node) {
          if (this instanceof Element && this.hasAttribute("data-effect-catalog-item"))
            probe.reads++;
          return descriptor.get!.call(this);
        },
      });
  });
  return page.locator(".layers-footer .layer-create-actions button");
}
/** The first event of the native mouse packet is measured, including React enter synthesized from pointerout. */
export async function armHover(
  page: Page,
  label: string,
  selector: string,
  point?: { x: number; y: number },
  presentationFrames: 1 | 2 = 2,
) {
  await page.evaluate(
    ({ label, selector, point, presentationFrames }) => {
      window.__effectMenuHover?.cancel();
      const selectors = [
        ".musart-app",
        ".inspector",
        ".canvas-area",
        ".editor-canvas",
        ".editor-gpu-scene",
      ];
      const counts = () =>
        Object.fromEntries(
          selectors.map((s) => [
            s,
            Number(document.querySelector<HTMLElement>(s)?.dataset.reactRenders ?? 0),
          ]),
        );
      const before = counts();
      let frame = 0,
        stopped = false;
      const events = point ? ["pointerout", "pointerover", "pointermove"] : ["pointerdown"];
      const cancel = () => {
        stopped = true;
        cancelAnimationFrame(frame);
        for (const event of events) document.removeEventListener(event, listen, true);
      };
      const state: NonNullable<Window["__effectMenuHover"]> = { cancel };
      window.__effectMenuHover = state;
      function listen(event: Event) {
        if (!(event instanceof PointerEvent)) return;
        if (
          point &&
          (Math.abs(event.clientX - point.x) > 0.5 || Math.abs(event.clientY - point.y) > 0.5)
        )
          return;
        for (const type of events) document.removeEventListener(type, listen, true);
        const generated = event.timeStamp,
          dispatched = performance.now();
        let hoverPresented: number | undefined;
        function check() {
          if (stopped) return;
          const trigger = point
            ? document.querySelector<HTMLElement>(`[data-effect-menu-category="${label}"]`)
            : null;
          if (
            hoverPresented === undefined &&
            trigger?.matches(":hover") &&
            getComputedStyle(trigger).backgroundColor !== "rgba(0, 0, 0, 0)"
          )
            hoverPresented = performance.now();
          const node = document.querySelector<HTMLElement>(selector);
          if (
            !node ||
            !node.getBoundingClientRect().height ||
            getComputedStyle(node).opacity === "0"
          ) {
            frame = requestAnimationFrame(check);
            return;
          }
          const present = () => {
            if (stopped) return;
            const presented = performance.now(),
              after = counts();
            state.sample = {
              label,
              generated,
              dispatched,
              presented,
              inputDelayMs: dispatched - generated,
              hoverPresentationOpportunityMs:
                hoverPresented === undefined ? undefined : hoverPresented - generated,
              inputToPresentationOpportunityMs: presented - generated,
              commits: Object.fromEntries(selectors.map((s) => [s, after[s]! - before[s]!])),
            };
          };
          if (presentationFrames === 1) present();
          else frame = requestAnimationFrame(present);
        }
        frame = requestAnimationFrame(check);
      }
      for (const event of events) document.addEventListener(event, listen, true);
    },
    { label, selector, point, presentationFrames },
  );
}
export async function hoverSample(page: Page) {
  await page.waitForFunction(() => !!window.__effectMenuHover?.sample);
  return page.evaluate(() => {
    const state = window.__effectMenuHover!;
    state.cancel();
    return state.sample!;
  });
}
export async function hoverCategory(page: Page, category: "effect" | "adjustment") {
  const trigger = page.getByRole("menuitem", {
    name: category === "effect" ? "Ajouter un effet" : "Ajouter un réglage",
    exact: true,
  });
  const box = await trigger.boundingBox();
  if (!box) throw Error("Category has no native bounds");
  const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await armHover(page, category, `[data-effect-category="${category}"]`, point);
  await page.mouse.move(point.x, point.y);
  return hoverSample(page);
}
