import { lazy, Suspense, useState, useRef } from "react";
import type { Layer, VectorDefinition } from "@musart/core";
import { useTranslation } from "react-i18next";
import { Spline } from "lucide-react";
import { Button } from "../../ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "../../ui/dialog";
import type { VectorEditorHandle } from "./VectorEditor";
import "./messages";
import "./vector-editor.css";
const VectorEditor = lazy(() => import("./VectorEditor"));
export function VectorProperties({
  layer,
  patch,
  preview,
  cancel,
}: {
  layer: Layer;
  patch: (patch: Partial<Layer>) => void;
  preview: (patch: Partial<Layer>) => void;
  cancel: () => void;
}) {
  const editor = useRef<VectorEditorHandle>(null);
  const { t } = useTranslation("vectorEditor"),
    [open, setOpen] = useState(false);
  const authored = layer.effects.some(
    (effect) => effect.enabled && effect.type === "morph" && effect.shapeMorph,
  );
  if (!layer.vector) return null;
  return (
    <section className="inspector-section">
      <h3>SVG</h3>
      <Button variant="outline" disabled={layer.locked || authored} onClick={() => setOpen(true)}>
        <Spline size={14} />
        {t("edit")}
      </Button>
      {authored && <p className="muted-description">{t("morphHint")}</p>}
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!value) cancel();
          setOpen(value);
        }}
      >
        <DialogContent
          className="vector-editor-dialog"
          onEscapeKeyDown={(event) => {
            if (editor.current?.cancelGesture()) event.preventDefault();
          }}
        >
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
          {open && (
            <Suspense fallback={<p role="status">{t("loading")}</p>}>
              <VectorEditor
                ref={editor}
                key={layer.id}
                vector={layer.vector}
                fill={layer.fill}
                stroke={layer.stroke}
                strokeWidth={layer.strokeWidth}
                onPreview={(vector: VectorDefinition) => preview({ vector })}
                onCommit={(vector: VectorDefinition) => patch({ vector })}
                onCancel={cancel}
              />
            </Suspense>
          )}
          <DialogClose asChild>
            <Button className="vector-editor-done">{t("close")}</Button>
          </DialogClose>
        </DialogContent>
      </Dialog>
    </section>
  );
}
