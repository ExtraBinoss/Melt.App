import { memo } from "react";
import { ChevronsDownUp, ChevronsUpDown } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Layer } from "@musart/core";
import { TimelineIconButton } from "./ControlButton";

export const TimelineCollapseControl = memo(function TimelineCollapseControl({
  active,
  collapsed,
  layers,
  onChange,
}: {
  active: boolean;
  collapsed: ReadonlySet<string>;
  layers: readonly Layer[];
  onChange(this: void, value: Set<string>): void;
}) {
  const { t } = useTranslation("motion");
  return (
    <TimelineIconButton
      disabled={!active}
      label={t(collapsed.size ? "expandAll" : "collapseAll")}
      onClick={() =>
        onChange(collapsed.size ? new Set() : new Set(layers.map((layer) => layer.id)))
      }
    >
      {collapsed.size ? <ChevronsUpDown size={13} /> : <ChevronsDownUp size={13} />}
    </TimelineIconButton>
  );
});
