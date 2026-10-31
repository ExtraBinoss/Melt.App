import type { EnginePort, Layer } from "@musart/core";
import { useAtom } from "jotai";
import { useTranslation } from "react-i18next";
import { Spline } from "lucide-react";
import { Button } from "../../ui/button";
import { vectorEditingAtom, vectorEditingTarget } from "../../../state/session/vector-editing";
import { editableVector } from "../../../canvas/vector/geometry";
import "./messages";

export function VectorProperties({ layer, engine }: { layer: Layer; engine: EnginePort }) {
  const { t } = useTranslation("vectorEditor"),
    [active, setActive] = useAtom(vectorEditingAtom(engine));
  const snapshot = engine.getSnapshot(),
    page = snapshot.project.pages.find((p) => p.id === snapshot.pageId)!;
  if (!layer.vector) return null;
  const editing =
    active?.projectId === snapshot.project.id &&
    active?.pageId === snapshot.pageId &&
    active?.layerId === layer.id;
  const authored = layer.effects.some(
    (effect) => effect.enabled && effect.type === "morph" && effect.shapeMorph,
  );
  return (
    <section className="inspector-section">
      <h3>{t("section")}</h3>
      <Button
        variant={editing ? "default" : "outline"}
        disabled={!editableVector(page, layer.id)}
        onClick={() => setActive(editing ? null : vectorEditingTarget(engine, layer.id))}
      >
        <Spline size={14} />
        {t(editing ? "close" : "edit")}
      </Button>
      {authored && <p className="muted-description">{t("morphHint")}</p>}
    </section>
  );
}
