import { openEffectSurface } from "../../layers/menu/effect-surface";
import { visible } from "./surfaces";
import type { EnginePort } from "@musart/core";
import { createMotionTransport } from "../../../services/motion/transport";
import { getExportJobs } from "../../../services/export/jobs";
import { requestCompositionExport } from "../../export/composition-request";
import { addDither, addPop } from "./project";
import type { TutorialAction } from "./content";

export interface TutorialContext {
  engine: EnginePort;
  projectId: string;
  layerId: string;
}
export function stepDone(
  action: TutorialAction,
  { engine, projectId, layerId }: TutorialContext,
): boolean {
  const snapshot = engine.getSnapshot();
  if (snapshot.project.id !== projectId) throw new Error("The active project changed.");
  const page = snapshot.project.pages.find((page) => page.id === snapshot.pageId)!;
  const layer = page.layers.find((layer) => layer.id === layerId);
  const tests: Record<TutorialAction, () => boolean> = {
    select: () => snapshot.selection.includes(layerId),
    effectMenu: () =>
      visible('.layer-create-actions button[aria-haspopup="menu"]')?.getAttribute("data-state") ===
      "open",
    effectCategory: () =>
      !!visible('.effect-catalog[data-effect-category="effect"]') ||
      visible('[data-effect-menu-category="effect"]')?.getAttribute("aria-expanded") === "true",
    dither: () => !!layer?.effects.some((effect) => effect.type === "dither"),
    motion: () => page.motion?.mode === "motion",
    pin: () => !!visible('[data-motion-pinned="true"]'),
    pop: () =>
      !!page.motion?.tracks.some(
        (track) =>
          track.layerId === layerId &&
          track.animations?.some((animation) => animation.preset.id === "scale-pop"),
      ),
    play: () => createMotionTransport(engine).read().playing,
    export: () => !!visible('.export-dialog[data-state="open"]'),
    video: () => !!visible(".motion-export-preview-surface"),
    render: () => {
      const job = getExportJobs(engine).read();
      return job?.projectId === projectId && job.kind === "motion" && job.status === "complete";
    },
  };
  return tests[action]();
}
export function waitForTutorial(
  context: TutorialContext,
  test: () => boolean,
  signal: AbortSignal,
  timeout = 5000,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const end = (error?: unknown) => {
      if (settled) return;
      settled = true;
      clearInterval(timer);
      clearTimeout(deadline);
      observer.disconnect();
      stops.forEach((stop) => stop());
      signal.removeEventListener("abort", abort);
      if (error) reject(error);
      else resolve();
    };
    const check = () => {
      try {
        if (signal.aborted) abort();
        else if (context.engine.getSnapshot().project.id !== context.projectId)
          end(new Error("The active project changed."));
        else if (test()) end();
      } catch (error) {
        end(error);
      }
    };
    const abort = () => end(new DOMException("Tutorial action cancelled", "AbortError"));
    const observer = new MutationObserver(check);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-state", "aria-expanded", "data-motion-pinned", "disabled"],
    });
    const stops = [
      context.engine.subscribe(check),
      createMotionTransport(context.engine).subscribe(check),
      getExportJobs(context.engine).subscribe(check),
    ];
    const timer = setInterval(check, 40);
    const deadline = setTimeout(
      () => end(new Error("This control is not ready. Try Next again.")),
      timeout,
    );
    signal.addEventListener("abort", abort, { once: true });
    check();
  });
}
async function control(context: TutorialContext, selector: string, signal: AbortSignal) {
  await waitForTutorial(
    context,
    () => {
      const node = visible(selector);
      return !!node && !node.hasAttribute("disabled");
    },
    signal,
  );
  if (signal.aborted || context.engine.getSnapshot().project.id !== context.projectId)
    throw new DOMException("Tutorial action cancelled", "AbortError");
  const node = visible(selector)!;
  node.scrollIntoView({ block: "nearest", inline: "nearest" });
  node.click();
}
export async function performStep(
  action: TutorialAction,
  context: TutorialContext,
  signal: AbortSignal,
) {
  const { engine, layerId } = context;
  const dismiss = () =>
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  const handlers: Record<TutorialAction, () => void | Promise<void>> = {
    select: () => engine.select([layerId]),
    effectMenu: () => waitForTutorial(context, () => openEffectSurface(engine, "menu"), signal),
    effectCategory: () =>
      waitForTutorial(context, () => openEffectSurface(engine, "library"), signal),
    dither: () => {
      addDither(engine, layerId);
      dismiss();
    },
    motion: async () => {
      dismiss();
      await control(context, '.motion-mode [data-segmented-value="motion"]', signal);
    },
    pin: () => control(context, '[data-tutorial="timeline-pin"]', signal),
    pop: () => {
      addPop(engine, layerId);
      dismiss();
    },
    play: () => {
      dismiss();
      createMotionTransport(engine).play();
    },
    export: () => {
      dismiss();
      requestCompositionExport(engine, engine.getSnapshot().pageId);
    },
    video: () => control(context, '.export-dialog [data-segmented-value="motion"]', signal),
    render: async () => {
      const jobs = getExportJobs(engine);
      if (!jobs.pending) await control(context, ".export-dialog .export-submit", signal);
      await waitForTutorial(
        context,
        () => {
          const job = jobs.read();
          if (job?.status === "failed" || job?.status === "cancelled")
            throw new Error("Video export did not complete. Try exporting again.");
          return stepDone("render", context);
        },
        signal,
        120000,
      );
    },
  };
  if (!stepDone(action, context)) await handlers[action]();
}
