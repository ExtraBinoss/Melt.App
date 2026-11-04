import type { EnginePort } from "@musart/core";
import { ObjectSelectionOptions } from "./segmentation/ObjectSelectionOptions";
import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import { toolAtom } from "../../state/session/editor";
import type { EditorServices } from "../../state/contracts";
import type { TaskRunner } from "../projects/ProjectDialog";
import { WandOptions } from "./wand/WandOptions";
import { SelectionModels } from "./segmentation/SelectionModels";

export function ToolSettings({
  services,
  engine,
  onTask,
}: {
  services: EditorServices;
  engine?: EnginePort;
  onTask: TaskRunner;
}) {
  const { t } = useTranslation(),
    tool = useAtomValue(toolAtom);
  if (tool !== "wand" && tool !== "segment") return null;
  return (
    <aside className="tool-settings floating-panel" data-tool={tool} aria-label={t(tool)}>
      {tool === "wand" ? (
        <WandOptions />
      ) : (
        <div>
          {services.objectSelection && (
            <ObjectSelectionOptions port={services.objectSelection} engine={engine} />
          )}
          <SelectionModels services={services} onTask={onTask} />
        </div>
      )}
    </aside>
  );
}
