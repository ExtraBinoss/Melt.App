import { useTranslation } from "react-i18next";
import { Check, Settings2, CornerDownRight, Spline, MoveHorizontal } from "lucide-react";
import type { VectorNodeMode } from "@musart/core";
import { Button } from "../../ui/button";
import { Popover, PopoverTrigger, PopoverContent } from "../../ui/popover";
import { ScrollShadow } from "../../shared/scroll/ScrollShadow";
import { SegmentedTabs } from "../../shared/segmented/SegmentedTabs";
import { VectorSettings, type VectorControls } from "./VectorSettings";
export function VectorCanvasToolbar({
  controls,
  onMode,
  onDone,
}: {
  controls: VectorControls;
  onMode: (mode: VectorNodeMode) => void;
  onDone: () => void;
}) {
  const { t } = useTranslation("vectorEditor");
  return (
    <aside className="vector-canvas-toolbar floating-panel" data-canvas-control>
      <strong>{t("section")}</strong>
      {controls.point && (
        <SegmentedTabs
          mode="choice"
          size="compact"
          tooltips
          label={t("mode")}
          value={controls.point.mode}
          items={[
            { value: "corner", label: t("corner"), icon: <CornerDownRight size={15} /> },
            { value: "smooth", label: t("smooth"), icon: <Spline size={15} /> },
            { value: "symmetric", label: t("symmetric"), icon: <MoveHorizontal size={15} /> },
          ]}
          onValueChange={(value) => onMode(value as VectorNodeMode)}
        />
      )}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={t("title")}>
            <Settings2 size={16} />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          data-canvas-control
          data-keybinding-capture
          side="top"
          className="vector-canvas-settings floating-panel"
        >
          <ScrollShadow className="vector-editor-settings-shadow">
            <VectorSettings controls={controls} />
          </ScrollShadow>
        </PopoverContent>
      </Popover>
      <Button size="sm" onClick={onDone}>
        <Check size={14} />
        {t("close")}
      </Button>
    </aside>
  );
}
