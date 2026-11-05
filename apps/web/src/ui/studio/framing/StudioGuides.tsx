import { useState } from "react";
import type { CaptureGuides, EnginePort } from "@musart/core";
import { Scan } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useProjectPreference } from "../../../components/workspace/preferences/context";
import { Popover, PopoverContent, PopoverTrigger } from "../../../components/ui/popover";
import { IconButton } from "../../../components/shared/IconButton";
import { Switch } from "../../../components/ui/switch";
import { useEngineValue } from "../../../state/session/editor";
import { FramePresetPicker } from "./FramePresetPicker";
import { getStudioViewport } from "./viewport";
import { GuideAppearance } from "./GuideAppearance";
import { DEFAULT_STUDIO_GUIDES } from "./guide-settings";
import { useGuideEdit } from "./use-guide-edit";
import "./messages";

export function StudioGuides({ engine }: { engine: EnginePort }) {
  const { t } = useTranslation("studioFraming");
  const [open, setOpen] = useState(false);
  const stored = useProjectPreference("studioCapture");
  const page = useEngineValue(engine, (snapshot) =>
    snapshot.project.pages.find((item) => item.id === snapshot.pageId)!,
  );
  const edit = useGuideEdit(engine, page);
  const current = getStudioViewport(engine).read();
  const bounds =
    current?.projectId === engine.getSnapshot().project.id && current.pageId === page.id
      ? current
      : page;
  const authored = page.captureGuides ?? stored;
  const value: CaptureGuides = {
    ...DEFAULT_STUDIO_GUIDES,
    preset: "full",
    width: Math.max(1, Math.round(bounds.width)),
    height: Math.max(1, Math.round(bounds.height)),
    full: true,
    visible: false,
    ...authored,
  };
  return (
    <Popover
      modal={false}
      open={open}
      onOpenChange={(next) => {
        if (!next) edit.cancel();
        setOpen(next);
      }}
    >
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
        <label className="studio-capture-heading">
          <strong>{t("showGuide")}</strong>
          <Switch
            size="sm"
            aria-label={t("showGuide")}
            checked={value.visible}
            onCheckedChange={(visible) => edit.commit({ ...value, visible })}
          />
        </label>
        {value.visible && (
          <>
            <FramePresetPicker
              value={value}
              bounds={bounds}
              identity={page}
              onChange={(next) => edit.commit({ ...value, ...next })}
              onPreview={(next) => edit.preview({ ...value, ...next })}
              onCancel={edit.cancel}
            />
            <GuideAppearance
              value={value}
              identity={page}
              onChange={(next) => edit.commit({ ...value, ...next })}
              onPreview={(next) => edit.preview({ ...value, ...next })}
              onCancel={edit.cancel}
            />
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
