import type { PointerEvent } from "react";
import { useTranslation } from "react-i18next";
import "./selection-edges.css";
/** Transparent edge targets reuse the same resize gestures as the visible side handles. */
export function SelectionEdges({
  layerId,
  name,
  onHandle,
}: {
  layerId: string;
  name: string;
  onHandle: (event: PointerEvent<HTMLButtonElement>) => void;
}) {
  const { t } = useTranslation();
  return (["n", "e", "s", "w"] as const).map((handle) => (
    <button
      key={handle}
      type="button"
      tabIndex={-1}
      aria-hidden="true"
      className="canvas-resize-edge"
      data-canvas-control=""
      data-layer-id={layerId}
      data-handle={handle}
      aria-label={`${t("resize")} ${name} ${handle}`}
      onPointerDown={onHandle}
    />
  ));
}
