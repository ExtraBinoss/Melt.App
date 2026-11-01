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
