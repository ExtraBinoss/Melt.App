import { beginProjectTiming } from "../services/performance/project-timing";

let studio: Promise<unknown> | undefined;
let editor: Promise<unknown> | undefined;
/** Warm independent editor chunks together, without mounting UI or creating GPU resources. */
export function preloadEditor(): Promise<unknown> {
  if (editor) return editor;
  const timing = beginProjectTiming("Prepare editor code");
  editor = Promise.all([
    import("../App"),
    import("../canvas/EditorCanvas"),
    import("../components/toolbar/Toolbar"),
    import("../components/workspace/EditorSidebar"),
    import("../components/motion-shell/MotionTimelineDock"),
  ])
    .then((modules) => {
      timing?.finish("published");
      return modules;
    })
    .catch((error: unknown) => {
      editor = undefined;
      timing?.finish("failed", error);
      throw error;
    });
  return editor;
}
/** Code only: no runtime, storage restoration, workers or renderer is created by this import. */
export function preloadStudio(): Promise<unknown> {
  studio ??= import("./Studio").catch((error: unknown) => {
    studio = undefined;
    throw error;
  });
  return studio;
}
/** Use landing-page idle time, with explicit cancellation and data-saving preferences. */
export function scheduleStudioPreload(
  prepare: () => Promise<unknown> = preloadStudio,
  surface: Window = window,
  delayMs = 0,
  enabled: () => boolean = () => true,
): () => void {
  const connection = (surface.navigator as Navigator & { connection?: { saveData?: boolean } })
    .connection;
  if (connection?.saveData || surface.document.hidden) return () => {};
  let cancelled = false,
    timer: number | undefined,
    idle: number | undefined;
  const run = () => {
    if (!cancelled && !surface.document.hidden && enabled()) void prepare().catch(() => {});
  };
  const queue = () => {
    if (cancelled) return;
    if (typeof surface.requestIdleCallback === "function")
      idle = surface.requestIdleCallback(run, { timeout: 2500 });
    else timer = surface.setTimeout(run, 800);
  };
  if (delayMs > 0) timer = surface.setTimeout(queue, delayMs);
  else queue();
  return () => {
    cancelled = true;
    if (timer !== undefined) surface.clearTimeout(timer);
    if (idle !== undefined) surface.cancelIdleCallback(idle);
  };
}
