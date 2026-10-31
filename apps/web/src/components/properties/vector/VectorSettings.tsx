import type { VectorPart, VectorNodeMode } from "@musart/core";
import { useTranslation } from "react-i18next";
import { Scissors, Trash2 } from "lucide-react";
import { VectorSelect } from "./VectorSelect";
import { NumberInput } from "../../shared/NumberInput";
import { Button } from "../../ui/button";
import { Switch } from "../../ui/switch";
import { Label } from "../../ui/label";
export interface VectorControls {
  index: number;
  parts: number;
  contour: number;
  contours: number;
  part: VectorPart;
  maxRadius: number;
  point?: {
    index: number;
    x: number;
    y: number;
    mode: VectorNodeMode;
    radius: number;
    canRound: boolean;
    canRemove: boolean;
    canSplit: boolean;
    closed: boolean;
  };
  selectPart: (index: number) => void;
  selectContour: (index: number) => void;
  coordinate: (axis: "x" | "y", value: number, preview?: boolean) => void;
  round: (value: number, preview?: boolean) => void;
  split: () => void;
  remove: () => void;
  close: (closed: boolean) => void;
  style: (style: Partial<VectorPart>) => void;
  cancel: () => void;
}
export function VectorSettings({ controls: c }: { controls: VectorControls }) {
  const { t } = useTranslation("vectorEditor"),
    p = c.point;
  return (
    <div className="vector-editor-settings">
      {c.parts > 1 && (
        <VectorSelect
          label={t("part")}
          value={String(c.index)}
          options={Array.from({ length: c.parts }, (_, i) => ({
            value: String(i),
            label: `${t("part")} ${i + 1}`,
          }))}
          onValueChange={(value) => c.selectPart(Number(value))}
        />
      )}
      {c.contours > 1 && (
        <VectorSelect
          label={t("contour")}
          value={String(c.contour)}
          options={Array.from({ length: c.contours }, (_, i) => ({
            value: String(i),
            label: `${t("contour")} ${i + 1}`,
          }))}
          onValueChange={(value) => c.selectContour(Number(value))}
        />
      )}
      {p && (
        <>
          <strong>{t("point", { index: p.index + 1 })}</strong>
          <div className="vector-point-fields">
            {(["x", "y"] as const).map((axis) => (
              <NumberInput
                key={`${c.contour}:${p.index}:${axis}`}
                label={axis.toUpperCase()}
                value={p[axis]}
                min={-100000}
                max={100000}
                onPreview={(v) => c.coordinate(axis, v, true)}
                onCommit={(v) => c.coordinate(axis, v)}
                onCancel={c.cancel}
              />
            ))}
          </div>
          <NumberInput
            key={`${c.contour}:${p.index}:round`}
            label={t("round")}
            value={p.radius}
            min={0}
            max={c.maxRadius}
            disabled={!p.canRound}
            onPreview={(v) => c.round(v, true)}
            onCommit={(v) => c.round(v)}
            onCancel={c.cancel}
          />
          {!p.canRound && <p className="muted-description">{t("roundHint")}</p>}
          <div className="vector-node-actions">
            <Button variant="outline" disabled={!p.canSplit} onClick={c.split}>
              <Scissors size={14} />
              {t("add")}
            </Button>
            <Button variant="outline" disabled={!p.canRemove} onClick={c.remove}>
              <Trash2 size={14} />
              {t("remove")}
            </Button>
          </div>
          <label className="switch-row">
            <Label>{t("closed")}</Label>
            <Switch aria-label={t("closed")} checked={p.closed} onCheckedChange={c.close} />
          </label>
        </>
      )}
      <VectorSelect
        label={t("cap")}
        value={c.part.linecap ?? "round"}
        options={["butt", "round", "square"].map((value) => ({
          value,
          label: t(value === "round" ? "roundStyle" : value),
        }))}
        onValueChange={(linecap) => c.style({ linecap: linecap as VectorPart["linecap"] })}
      />
      <VectorSelect
        label={t("join")}
        value={c.part.linejoin ?? "round"}
        options={["miter", "round", "bevel"].map((value) => ({
          value,
          label: t(value === "round" ? "roundStyle" : value),
        }))}
        onValueChange={(linejoin) => c.style({ linejoin: linejoin as VectorPart["linejoin"] })}
      />
      <p className="muted-description">{t("hint")}</p>
    </div>
  );
}
