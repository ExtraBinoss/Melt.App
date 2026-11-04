import {
  MousePointer2,
  Hand,
  Type,
  WandSparkles,
  Blend,
  ImagePlus,
  Undo2,
  Redo2,
} from "lucide-react";
import { useAtom } from "jotai";
import { memo } from "react";
import type { EnginePort } from "@musart/core";
import { useTranslation } from "react-i18next";
import { toolAtom } from "../../state/session/editor";
import { ToolbarScroll } from "./dock/ToolbarScroll";
import { IconButton } from "../shared/IconButton";
import { SpatialLibrary } from "../spatial/SpatialLibrary";
import { ShapeToolSlot } from "../assets/ShapeToolSlot";
import { Separator } from "../ui/separator";
import { MagicSearch, type MagicSearchProps, type SearchSurface } from "../search/MagicSearch";
import { PinnedCommands } from "./dock/PinnedCommands";
import { ToolbarCommand } from "./ToolbarCommand";
import { useKeybindings } from "../../state/keybindings/use-keybindings";
import { bindingLabel } from "../search/shortcuts";

const tools = [
  ["pointer", MousePointer2, "action:toolPointer"],
  ["hand", Hand, "action:toolHand"],
  ["text", Type, "action:toolText"],
  ["wand", WandSparkles, "action:toolWand"],
  ["segment", Blend, "action:toolSegment"],
] as const;
export function Toolbar(props: MagicSearchProps) {
  return <MagicSearch {...props}>{ToolbarContents}</MagicSearch>;
}
function ToolbarContents(surface: SearchSurface) {
  const { engine, commands } = surface;
  const canUndo = !commands.find((item) => item.id === "action:undo")?.disabled;
  const canRedo = !commands.find((item) => item.id === "action:redo")?.disabled;
  const { t } = useTranslation();
  const bindings = useKeybindings();
  return (
    <nav className="toolbar floating-panel" aria-label={t("selection")}>
      <ToolbarScroll>
        <StaticTools engine={engine} />
        <Separator />
        <ToolbarCommand
          id="action:importImages"
          label={t("import")}
          shortcut={bindingLabel("action:importImages", bindings)}
          run={surface.run}
          Icon={ImagePlus}
        />
        <Separator />
        <ToolbarCommand
          id="action:undo"
          label={t("undo")}
          shortcut={bindingLabel("action:undo", bindings)}
          disabled={!canUndo}
          run={surface.run}
          Icon={Undo2}
        />
        <ToolbarCommand
          id="action:redo"
          label={t("redo")}
          shortcut={bindingLabel("action:redo", bindings)}
          disabled={!canRedo}
          run={surface.run}
          Icon={Redo2}
        />
        <PinnedCommands commands={surface.commands} run={surface.run} />
        {surface.trigger}
      </ToolbarScroll>
    </nav>
  );
}

/** Command availability never rebuilds tools; their own preferences and active atom stay live. */
const StaticTools = memo(function StaticTools({ engine }: { engine: EnginePort }) {
  const { t } = useTranslation();
  const [tool, setTool] = useAtom(toolAtom);
  const bindings = useKeybindings();
  return (
    <>
      {tools.map(([id, Icon, shortcut]) => (
        <IconButton
          key={id}
          label={t(id)}
          shortcut={bindingLabel(shortcut, bindings)}
          active={tool === id}
          onClick={() => setTool(id)}
          className="tool-button"
        >
          <Icon strokeWidth={1.65} />
        </IconButton>
      ))}
      <ShapeToolSlot engine={engine} />
      <SpatialLibrary engine={engine} />
    </>
  );
});
