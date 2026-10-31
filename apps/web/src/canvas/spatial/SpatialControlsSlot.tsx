import { lazy, Suspense } from "react";
import { useAtomValue } from "jotai";
import type { EnginePort } from "@musart/core";
import { useEngineValue } from "../../state/session/editor";
import { spatialEditingAtom } from "../../state/session/spatial-editing";
import type { SceneController } from "../session/scene-controller";
const SpatialControls = lazy(() => import("./SpatialControls"));
export function SpatialControlsSlot({
  engine,
  controller,
}: {
  engine: EnginePort;
  controller: SceneController;
}) {
  const target = useAtomValue(spatialEditingAtom(engine));
  const projection = useEngineValue(
    engine,
    (snapshot) =>
      snapshot.project.pages.find((page) => page.id === snapshot.pageId)?.spatial?.camera
        .projection ?? "perspective",
  );

  return (
    target && (
      <Suspense fallback={null}>
        <SpatialControls key={projection} engine={engine} controller={controller} target={target} />
      </Suspense>
    )
  );
}
