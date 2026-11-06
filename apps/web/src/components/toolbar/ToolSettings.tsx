import { DepthPreparationOptions } from "./segmentation/DepthPreparationOptions";
import { useLayoutEffect, useSyncExternalStore } from "react";
import type { EnginePort } from "@musart/core";
import { ObjectSelectionOptions } from "./segmentation/ObjectSelectionOptions";
import { useAtom } from "jotai";
import { useTranslation } from "react-i18next";
import { toolAtom } from "../../state/session/editor";
import type { EditorServices } from "../../state/contracts";
import type { TaskRunner } from "../projects/ProjectDialog";
import { WandOptions } from "./wand/WandOptions";
const emptySubscribe = () => () => {},
  emptyRead = () => null;
export function ToolSettings({
  services,
  onTask,
}: {
  services: EditorServices;
  engine?: EnginePort;
  onTask: TaskRunner;
}) {
  const { t } = useTranslation();
  const [tool, setTool] = useAtom(toolAtom);
  const port = services.objectSelection;
  useLayoutEffect(() => port?.retainPresentation?.(), [port]);
  const state = useSyncExternalStore(
    port?.subscribe ?? emptySubscribe,
    port?.read ?? emptyRead,
    emptyRead,
  );
  const depth = services.depthPreparation;
  useLayoutEffect(() => depth?.retainPresentation(), [depth]);
  const depthState = useSyncExternalStore(
    depth?.subscribe ?? emptySubscribe,
    depth?.read ?? emptyRead,
    emptyRead,
  );
  if (depth && depthState)
    return (
      <aside
        className="tool-settings floating-panel"
        data-tool="depth-anything"
        aria-label={t("depth-anything")}
      >
        <DepthPreparationOptions port={depth} />
      </aside>
    );
  if (tool === "wand" && !state?.automatic)
    return (
      <aside className="tool-settings floating-panel" data-tool="wand" aria-label={t("wand")}>
        <WandOptions />
      </aside>
    );
  if (!port || !state) return null;
  return (
    <aside className="tool-settings floating-panel" data-tool="segment" aria-label={t("segment")}>
      <ObjectSelectionOptions
        port={port}
        model={
          state.mediaKind === "video"
            ? services.videoBackgroundModel
            : state.automatic
              ? services.backgroundModel
              : services.segmentationModel
        }
        onTask={onTask}
        refining={tool === "segment"}
        onRefine={() => {
          port.refine();
          setTool("segment");
        }}
        onClose={() => {
          port.reset();
          if (tool === "segment") setTool("pointer");
        }}
      />
    </aside>
  );
}
