import { useState } from "react";
import { useAtom } from "jotai";
import { useTranslation } from "react-i18next";
import { Type } from "lucide-react";
import { toolAtom } from "../../state/session/editor";
import { textInsertionModeAtom, type TextInsertionMode } from "../../state/session/text-insertion";
import { IconButton } from "../shared/IconButton";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Button } from "../ui/button";
import { useKeybindings } from "../../state/keybindings/use-keybindings";
import { bindingLabel } from "../search/shortcuts";
import "../spatial/messages";
import "./text-tool.css";

export function TextTool({
  defaultMode,
  tooltipSide,
}: {
  defaultMode: TextInsertionMode;
  tooltipSide?: "top" | "right" | "bottom" | "left";
}) {
  const { t } = useTranslation();
  const { t: spatial } = useTranslation("spatial");
  const [open, setOpen] = useState(false);
  const [tool, setTool] = useAtom(toolAtom);
  const [choice, setChoice] = useAtom(textInsertionModeAtom);
  const bindings = useKeybindings();
  const mode = choice ?? defaultMode;
  return (
    <Popover open={open} onOpenChange={setOpen} modal={false}>
      <PopoverTrigger asChild>
        <IconButton
          label={t("text")}
          tooltipSide={tooltipSide}
          shortcut={bindingLabel("action:toolText", bindings)}
          active={tool === "text"}
          className="tool-button"
        >
          <Type strokeWidth={1.65} />
        </IconButton>
      </PopoverTrigger>
      <PopoverContent
        side={tooltipSide === "bottom" ? "bottom" : "right"}
        align="start"
        className="text-tool-popover"
        aria-label={t("text")}
        data-canvas-control
      >
        {(["2d", "3d"] as const).map((value) => (
          <Button
            key={value}
            variant="ghost"
            aria-pressed={mode === value}
            onClick={() => {
              setChoice(value);
              setTool("text");
              setOpen(false);
            }}
          >
            <Type size={16} aria-hidden />
            <span>
              {t("text")} {spatial(value === "2d" ? "flat" : "volume")}
            </span>
          </Button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
