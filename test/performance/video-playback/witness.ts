import {
  applyMotionFrame,
  compileMotion,
  evaluateMotion,
  EditorEngine,
  type Project,
} from "../../../packages/core/src/index";
import { createRenderSession } from "../../../packages/render/src/export/standalone";
import { SceneProfileSource } from "../../../apps/web/src/canvas/render/scene-profile-source";

/** Native diagnostic entry: the production graph, independent originals and real GPU timestamps. */
export async function prepareVideoLab(
  project: Project,
  urls: Record<string, string>,
  gpuTimings = false,
) {
  const originals = new Map<string, Blob>();
  for (const [id, url] of Object.entries(urls)) {
    const response = await fetch(url);
    if (!response.ok) throw Error(`Local video fixture is unavailable: ${id}`);
    originals.set(id, await response.blob());
  }
  const stable = new EditorEngine(project).getSnapshot().project;
  const page = stable.pages[0]!,
    program = compileMotion(stable, { compositionId: page.id });
  const resolver = {
    resolveOriginal: async (asset: { id: string }) => {
      const original = originals.get(asset.id);
      if (!original) throw Error(`Missing independent original: ${asset.id}`);
      return original;
    },
  };
  const session = createRenderSession({
    maxBytes: 384 * 1024 * 1024,
    mediaMode: "playback",
    mediaResolver: resolver,
  });
  let latestCanvas: HTMLCanvasElement | null = null;
  let profiler: SceneProfileSource | null = null;
  const samples: unknown[] = [];
  return {
    async frame(index: number) {
      const plan = evaluateMotion(program, { value: index, rate: 60 });
      profiler?.begin(index);
      const started = performance.now();
      await session.withCanvasFrame(
        applyMotionFrame(program, plan),
        stable.assets,
        (canvas) => {
          latestCanvas = canvas;
          canvas.style.cssText = "display:block;width:960px;height:540px";
          if (!canvas.isConnected) document.body.append(canvas);
        },
        {
          scale: 1,
          motionFrame: plan,
          mediaMode: "playback",
          mediaResolver: resolver,
          profileVideo: true,
          traceFrames: true,
        },
      );
      const duration = performance.now() - started;
      profiler?.prepared(index);
      profiler?.presented(page.id, index);
      if (gpuTimings && !profiler) {
        // Diagnostic-only access to this witness's owned initialized renderer; no app renderer is borrowed.
        const renderer = Reflect.get(session, "renderer");
        profiler = new SceneProfileSource(renderer, () => session.stats());
        profiler.open((sample) => samples.push(sample));
      }
      return duration;
    },
    capture: () => latestCanvas?.toDataURL("image/png") ?? null,
    stats: () => session.stats(),
    samples: () => samples,
    async dispose() {
      profiler?.dispose();
      await session.dispose();
      originals.clear();
      latestCanvas = null;
    },
  };
}
