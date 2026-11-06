import { useEffect, useRef } from "react";
import { Layers, LockKeyhole } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Composition, EnginePort } from "@musart/core";
import type { CanvasContextTarget } from "../../interaction/transfers";
import { createTimelineHoverSource } from "../../../state/motion/hover";
import {
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "../../../components/ui/dropdown-menu";
import "./messages";

/** Native menu focus/pointer leases share the retained canvas outline, without React previews. */
export function CanvasLayerCandidates({
  engine,
  page,
  candidates,
  current,
}: {
  engine: EnginePort;
  page: Composition;
  candidates: readonly CanvasContextTarget[];
  current: () => boolean;
}) {
  const { t } = useTranslation("canvasPicking");
  const release = useRef<(() => void) | null>(null);
  function clear() {
    release.current?.();
    release.current = null;
  }
  useEffect(
    () => () => {
      release.current?.();
      release.current = null;
    },
    [engine],
  );
  if (!candidates.length) return null;
  const layers = new Map(page.layers.map((layer) => [layer.id, layer]));
  function preview(target: CanvasContextTarget) {
    if (!current()) {
      clear();
      return;
    }
    const previous = release.current;
    release.current = createTimelineHoverSource(engine).show(target.compositionId, target.layerId);
    previous?.();
  }
  return (
    <>
      <DropdownMenuSub
        onOpenChange={(open) => {
          if (!open) clear();
        }}
      >
        <DropdownMenuSubTrigger title={t("hint")}>
          <Layers size={14} />
          {t("selectLayer")}
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent className="max-h-80 overflow-y-auto" onPointerLeave={clear}>
          {candidates.slice(0, 64).map((target) => {
            const layer = layers.get(target.layerId);
            return (
              layer && (
                <DropdownMenuItem
                  key={layer.id}
                  data-select-layer-id={layer.id}
                  onFocus={() => preview(target)}
                  onPointerMove={() => preview(target)}
                  onBlur={clear}
                  onSelect={() => {
                    if (current()) engine.select([layer.id]);
                    clear();
                  }}
                >
                  <span className="max-w-64 truncate">{layer.name}</span>
                  {target.locked && <LockKeyhole size={12} aria-label={t("locked")} />}
                </DropdownMenuItem>
              )
            );
          })}
          {candidates.length > 64 && (
            <DropdownMenuLabel>{t("more", { count: candidates.length - 64 })}</DropdownMenuLabel>
          )}
        </DropdownMenuSubContent>
      </DropdownMenuSub>
      <DropdownMenuSeparator />
    </>
  );
}
