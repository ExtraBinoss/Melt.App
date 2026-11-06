import { expect, type Page } from "@playwright/test";
import { createStudioStarter } from "../../../apps/web/src/services/projects/templates/designed/studio-starter/build";
import { installReadbackProbe } from "./readback-probe";
import { installSearchProfile } from "./search-profile";

export type PaletteKind = "cmdk" | "quick-add";
export type WorkspaceKind = "classic" | "studio";
export const paletteSelector = (kind: PaletteKind) =>
  kind === "cmdk" ? "[data-magic-search]" : ".quick-add-popover";

export async function preparePaletteProfile(
  page: Page,
  workspace: WorkspaceKind,
  kind: PaletteKind,
) {
  await installReadbackProbe(page);
  await installSearchProfile(page, kind);
  await page.addInitScript(() => {
    localStorage.setItem("musart.language", "en");
    localStorage.setItem("musart.editor-tutorial.v1", "done");
    localStorage.setItem("musart.onboarding.v1", JSON.stringify({ version: 1, completed: true }));
  });
  await page.goto(`/editor?automation=1&workspace=${workspace}`);
  await page.waitForFunction(() => Boolean(window.musart));
  const project = createStudioStarter().project;
  await page.evaluate((project) => {
    window.musart!.load(project);
    window.musart!.select([]);
  }, project);
  await page.waitForFunction(() => {
    const canvas = document.querySelector<HTMLCanvasElement>(".editor-gpu-scene canvas"),
      state = window.musart!.session();
    return (
      canvas?.dataset.rendererReady === "true" &&
      canvas.dataset.projectId === state.projectId &&
      Number(canvas.dataset.canonicalRevision) === state.revision &&
      canvas.dataset.presentationReady === "true"
    );
  });
  await page.bringToFront();
  const board = (await page.getByTestId("artboard").boundingBox())!;
  const point = { x: board.x + board.width * 0.035, y: board.y + board.height * 0.035 };
  return { project, point };
}
export async function openPalette(page: Page, kind: PaletteKind, point: { x: number; y: number }) {
  const count = await page.evaluate(() => window.__searchProfile!.samples.length);
  if (kind === "cmdk") await page.keyboard.press("Control+k");
  else await page.mouse.dblclick(point.x, point.y);
  await expect(page.locator(paletteSelector(kind)).getByRole("combobox")).toBeFocused();
  await page.waitForFunction(
    (count) =>
      window
        .__searchProfile!.samples.slice(count)
        .some((sample) => sample.kind === "open" && sample.settledAt && sample.resultsSecondRaf),
    count,
  );
}
export async function closePalette(page: Page, kind: PaletteKind) {
  await page.keyboard.press("Escape");
  await expect(page.locator(paletteSelector(kind))).toHaveCount(0);
}
