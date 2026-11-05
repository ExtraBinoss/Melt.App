import { useState } from "react";
import type { EnginePort } from "@musart/core";
import { Scan } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  useProjectPreferences,
  useProjectPreference,
} from "../../../components/workspace/preferences/context";
import { Popover, PopoverContent, PopoverTrigger } from "../../../components/ui/popover";
import { IconButton } from "../../../components/shared/IconButton";
import { Switch } from "../../../components/ui/switch";
import { FramePresetPicker } from "./FramePresetPicker";
import { getStudioViewport } from "./viewport";
import "./messages";
export function StudioGuides({ engine }: { engine: EnginePort }) {
  const { t } = useTranslation("studioFraming"),
    preferences = useProjectPreferences();
  const [open, setOpen] = useState(false);
  const stored = useProjectPreference("studioCapture");
  const current = getStudioViewport(engine).read();
  const snapshot = engine.getSnapshot(),
    page = snapshot.project.pages.find((item) => item.id === snapshot.pageId)!;
  const bounds =
    current?.projectId === snapshot.project.id && current.pageId === page.id ? current : page;
  const value =
    stored && !stored.full
      ? stored
      : {
          preset: "full",
          width: Math.max(1, Math.round(bounds.width)),
          height: Math.max(1, Math.round(bounds.height)),
          full: true,
          visible: stored?.visible ?? false,
        };
  return (
    <Popover modal={false} open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <IconButton label={t("guides")} tooltipSide="bottom" active={value.visible}>
          <Scan size={17} />
        </IconButton>
      </PopoverTrigger>
      <PopoverContent
        className="studio-capture-popover"
        side="bottom"
        align="center"
        collisionPadding={12}
        data-canvas-control
      >
        <div className="studio-capture-heading">
          <strong>{t("title")}</strong>
          <Switch
            aria-label={t("showGuide")}
            checked={value.visible}
            onCheckedChange={(visible) =>
              preferences?.commit("studioCapture", { ...value, visible })
            }
          />
        </div>
        <FramePresetPicker
          value={value}
          bounds={bounds}
          onChange={(next) => preferences?.commit("studioCapture", { ...next, visible: true })}
        />
        <p>{t("captureHint")}</p>
      </PopoverContent>
    </Popover>
  );
}
