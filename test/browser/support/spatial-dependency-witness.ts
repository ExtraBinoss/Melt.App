import type { Composition, Project } from "@musart/core";
import * as core from "../../../packages/core/src/index";
import { createRenderSession } from "../../../packages/render/src/index";
import { CompositionScene } from "../../../packages/render/src/spatial/scene/CompositionScene";

// Resolve the renderer and its observed class through Vite's static dependency graph.
// A separate dynamic /@fs import can load an unversioned second ESM class during HMR.
export async function runSourceBindingsWitness(pages: Composition[]) {
  const originalPrepare = CompositionScene.prototype.prepare,
    originalRender = CompositionScene.prototype.render;
  const synchronizations: { count: number; meshes: number }[] = [];
  const passes: { sync: number; assignments: number }[] = [];
  CompositionScene.prototype.prepare = async function (...args) {
    const before = this.bindingStats();
    await originalPrepare.apply(this, args);
    const after = this.bindingStats();
    synchronizations.push({
      count: after.synchronizations - before.synchronizations,
      meshes: after.meshes,
    });
  };
  CompositionScene.prototype.render = function (...args) {
    const before = this.bindingStats(),
      result = originalRender.apply(this, args),
      after = this.bindingStats();
    passes.push({
      sync: after.synchronizations - before.synchronizations,
      assignments: after.assignments - before.assignments,
    });
    return result;
  };
  const results = [];
  try {
    for (const forceWebGL of [false, true])
      for (const page of pages) {
        const session = createRenderSession({ forceWebGL, maxBytes: 128 * 1024 * 1024 });
        try {
          const capture = async (composition: typeof page) => {
            synchronizations.length = 0;
            passes.length = 0;
            const image = await session.withCanvasFrame(
              composition,
              {},
              (canvas) => canvas.toDataURL("image/png"),
              { mediaMode: "exact" },
            );
            return { synchronizations: [...synchronizations], passes: [...passes], image };
          };
          const first = await capture(page);
          const changed = {
            ...page,
            layers: page.layers.map((layer) => ({ ...layer, fill: "#3388EE" })),
          };
          const paint = await capture(changed);
          const restored = await capture(page);
          results.push({ forceWebGL, count: page.layers.length, first, paint, restored });
        } finally {
          await session.dispose();
        }
      }
  } finally {
    CompositionScene.prototype.prepare = originalPrepare;
    CompositionScene.prototype.render = originalRender;
  }
  return { results, readbacks: window.__musartVideoReadbacks };
}

export async function runPropertyDependenciesWitness(project: Project) {
  const originalRender = CompositionScene.prototype.render;
  const rendered: string[] = [];
  CompositionScene.prototype.render = function (layer) {
    rendered.push(layer.id);
    return originalRender.call(this, layer);
  };
  const results = [];
  try {
    for (const forceWebGL of [false, true]) {
      const session = createRenderSession({ forceWebGL, maxBytes: 128 * 1024 * 1024 });
      try {
        const original = project.pages[0]!;
        const capture = async (composition: typeof original) => {
          rendered.length = 0;
          const image = await session.withCanvasFrame(
            composition,
            project.assets,
            (canvas) => canvas.toDataURL("image/png"),
            { mediaMode: "exact" },
          );
          return {
            image,
            rendered: [...rendered],
            captures: session.stats()?.spatial?.reflections?.captures ?? 0,
          };
        };
        const first = await capture(original);
        const recolored = {
          ...original,
          layers: original.layers.map((layer) =>
            layer.id === "left" ? { ...layer, fill: "#FF361C" } : layer,
          ),
        };
        const paint = await capture(recolored);
        const reflected = {
          ...recolored,
          spatial: {
            ...original.spatial!,
            reflections: { mode: "scene" as const, quality: "draft" as const },
          },
        };
        const probes = await capture(reflected);
        const recapture = await capture({
          ...reflected,
          layers: reflected.layers.map((layer) =>
            layer.id === "left" ? { ...layer, fill: "#00FF36" } : layer,
          ),
        });
        const program = core.compileMotion(project, { compositionId: original.id });
        const sample = (value: number) =>
          core.applyMotionFrame(program, core.evaluateMotion(program, { value, rate: 1 }));
        const a = sample(0),
          middle = sample(1);
        // Duration is exclusive for normal playback; this witness requests the
        // preview-only left-limit presence while sampling exact endpoint values.
        const endpointPlan = core.evaluateMotion(
          program,
          { value: 2, rate: 1 },
          { terminalPreview: true },
        );
        const b = core.applyMotionFrame(program, endpointPlan);
        const motionStart = await capture(a),
          motionEnd = await capture(b);
        results.push({
          forceWebGL,
          first,
          paint,
          probes,
          recapture,
          motionStart,
          motionEnd,
          endpoint: {
            terminalPreview: endpointPlan.terminalPreview,
            activeLayerIds: [...endpointPlan.activeLayerIds],
            yaw: b.spatial!.camera.yaw,
            intensity: b.spatial!.environment.intensity,
            x: b.spatial!.lights[0]!.x,
          },
          sampled: {
            yaw: middle.spatial!.camera.yaw,
            intensity: middle.spatial!.environment.intensity,
            x: middle.spatial!.lights[0]!.x,
          },
        });
      } finally {
        await session.dispose();
      }
    }
  } finally {
    CompositionScene.prototype.render = originalRender;
  }
  return { results, readbacks: window.__musartVideoReadbacks };
}
