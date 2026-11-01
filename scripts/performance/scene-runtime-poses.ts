import {
  applyMotionFrame,
  compileMotion,
  createProject,
  EditorEngine,
  evaluateMotion,
  isPublishedComposition,
} from "@musart/core";
import type { Asset, Composition } from "@musart/core";
import { applyPreview } from "../../apps/web/src/canvas/interaction/gestures";

export interface SceneDependencyCase {
  name: string;
  pages: Composition[];
  stamp?: boolean;
  originals?: boolean;
  owned?: boolean;
}
/** Real materializers, prepared outside dependency timing. No manually issued certificates. */
export function runtimePoseCases(
  base: Composition,
  assets: Record<string, Asset>,
): SceneDependencyCase[] {
  const project = createProject({
    assets,
    pages: [
      {
        ...base,
        motion: {
          version: 1,
          initialized: true,
          mode: "motion",
          duration: { value: 3, rate: 1 },
          frameRate: { numerator: 30, denominator: 1 },
          tracks: [
            {
              id: "runtime-track",
              layerId: "text-1",
              start: { value: 0, rate: 1 },
              end: null,
              properties: [
                {
                  id: "runtime-x",
                  target: { kind: "layer", layerId: "text-1", property: "x" },
                  keyframes: [
                    { id: "runtime-a", time: { value: 0, rate: 1 }, value: 8 },
                    { id: "runtime-b", time: { value: 2, rate: 1 }, value: 120 },
                  ],
                },
              ],
            },
          ],
        },
      },
    ],
  });
  const engine = new EditorEngine(project);
  const fromEngine = compileMotion(engine.getSnapshot().project, { compositionId: base.id });
  const external = compileMotion(project, { compositionId: base.id });
  const pose = (program: typeof fromEngine) =>
    Array.from({ length: 32 }, (_, index) =>
      applyMotionFrame(program, evaluateMotion(program, { value: index + 1, rate: 30 })),
    );
  const gestures = Array.from({ length: 32 }, (_, index) =>
    applyPreview(base, [
      {
        layerId: "text-1",
        patch: { x: index + 1, rotation: index / 2 },
      },
    ]),
  );
  const bulkGestures = Array.from({ length: 32 }, (_, index) =>
    applyPreview(
      base,
      base.layers
        .filter((layer) => layer.kind === "text" && !layer.maskSource)
        .map((layer) => ({
          layerId: layer.id,
          patch: { x: layer.x + index + 1, y: layer.y + index / 2 },
        })),
    ),
  );
  return [
    { name: "compiled-motion-engine", pages: pose(fromEngine) },
    { name: "compiled-motion-external-conservative", pages: pose(external) },
    { name: "gesture-unowned-conservative", pages: gestures },
    { name: "gesture-owned-frame", pages: gestures, owned: true },
    { name: "gesture-owned-bulk", pages: bulkGestures, owned: true },
  ];
}
export function poseOwnership(test: SceneDependencyCase) {
  return {
    preparedPoses: test.pages.length,
    certifiedPoses: test.pages.filter(isPublishedComposition).length,
    frozenPoses: test.pages.filter(Object.isFrozen).length,
    explicitFrameOwnership: !!test.owned,
  };
}
