import { useState } from "react";
import { Plus } from "lucide-react";
import {
  createEffect,
  getEffectDefinition,
  type Effect,
  type Composition,
  type Layer,
  type EnginePort,
} from "@musart/core";
import { useTranslation } from "react-i18next";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent } from "../ui/dropdown-menu";
import { EffectMenu } from "../layers/EffectMenu";
import { Button } from "../ui/button";
import { EffectStack } from "./effects/EffectStack";
import { ownerHasDepth } from "../layers/catalog/model";

export function EffectsPanel({
  layer,
  page,
  engine,
  onPatch,
  onPreview,
  onCancel,
}: {
  layer: Layer;
  page?: Composition;
  engine?: EnginePort;
  onPatch(this: void, patch: Partial<Layer>): void;
  onPreview(this: void, patch: Partial<Layer>): void;
  onCancel?: () => void;
}) {
  const { t } = useTranslation();
  const ownerPage =
    page ??
    engine
      ?.getSnapshot()
      .project.pages.find((item) => item.layers.some((item) => item.id === layer.id));
  const [opened, setOpened] = useState({ owner: layer.id, value: layer.effects.at(-1)?.id ?? "" });
  if (opened.owner !== layer.id)
    setOpened({ owner: layer.id, value: layer.effects.at(-1)?.id ?? "" });
  function update(effect: Effect, patch: Partial<Effect>, preview = false) {
    const effects = layer.effects.map((item) =>
      item.id === effect.id ? { ...item, ...patch } : item,
    );
    if (preview) onPreview({ effects });
    else onPatch({ effects });
  }
  return (
    <section className="inspector-section effects-section">
      <div className="section-title">
        <h3>{t("effects")}</h3>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-xs" aria-label={t("addEffect")}>
              <Plus size={15} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <EffectMenu
              owner={{
                scope: "layer",
                depthAvailable: Boolean(ownerPage && ownerHasDepth(ownerPage, layer.id)),
              }}
              onAdd={(type) => {
                const effect = createEffect(type);
                onPatch({ effects: [...layer.effects, effect] });
                setOpened({ owner: layer.id, value: effect.id });
              }}
            />
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {!layer.effects.some((effect) => !getEffectDefinition(effect.type).retired) && (
        <p className="muted-description">{t("noEffects")}</p>
      )}
      <EffectStack
        effects={layer.effects}
        engine={engine}
        layerId={layer.id}
        value={opened.value}
        onValueChange={(value) => setOpened({ owner: layer.id, value })}
        onUpdate={update}
        onChange={(effects) => onPatch({ effects })}
        onCancel={onCancel}
      />
      {layer.effects.length > 0 && <p className="effect-footnote">{t("effectClipped")}</p>}
    </section>
  );
}
