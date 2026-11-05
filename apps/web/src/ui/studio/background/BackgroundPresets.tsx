import { useEffect, useMemo } from "react";
import { useStore } from "jotai";
import { useTranslation } from "react-i18next";
import {
  BACKGROUND_CATEGORIES,
  BACKGROUND_PRESETS,
  compareMotionTime,
  type Composition,
  type EnginePort,
} from "@musart/core";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "../../../components/ui/accordion";
import { previewAtom } from "../../../state/session/editor";
import { createMotionTransport } from "../../../services/motion/transport";
import { motionTimeChanges } from "../../../state/session/motion-edit";
import { createBackgroundRecipePreview } from "./preview";
import { PresetSwatch } from "./PresetSwatch";
import { backgroundLayer } from "./model";

export function BackgroundPresets({
  engine,
  page,
  run,
}: {
  engine: EnginePort;
  page: Composition;
  run: (task: () => void) => void;
}) {
  const { t } = useTranslation("studioBackground");
  const store = useStore();
  const transport = useMemo(() => createMotionTransport(engine), [engine]);
  const draft = useMemo(
    () =>
      createBackgroundRecipePreview(
        engine,
        {
          read: () => store.get(previewAtom),
          write: (value) => store.set(previewAtom, value),
        },
        {
          read: () => transport.readFrame(),
          subscribe: (listener) => motionTimeChanges(engine).subscribe(listener),
        },
      ),
    [engine, store, transport],
  );
  useEffect(() => draft.start(), [draft]);
  const disabled = Boolean(backgroundLayer(page)?.locked);
  return (
    <section
      className="studio-background-presets"
      aria-label={t("presets")}
      aria-description={t("previewHint")}
    >
      <div className="studio-background-preset-heading">
        <strong>{t("presets")}</strong>
        <span>{BACKGROUND_PRESETS.length}</span>
      </div>
      <Accordion type="multiple" defaultValue={[...BACKGROUND_CATEGORIES]}>
        {BACKGROUND_CATEGORIES.map((category) => (
          <AccordionItem value={category} key={category}>
            <AccordionTrigger className="studio-background-category">
              {t(`categories.${category}`)}
            </AccordionTrigger>
            <AccordionContent>
              <div
                className="studio-background-preset-grid"
                onPointerLeave={draft.cancel}
                onBlur={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget)) draft.cancel();
                }}
              >
                {BACKGROUND_PRESETS.filter((preset) => preset.category === category).map(
                  (preset) => (
                    <button
                      type="button"
                      key={preset.id}
                      className="studio-background-preset"
                      disabled={disabled}
                      aria-label={preset.name}
                      title={preset.name}
                      data-background-preset={preset.id}
                      onPointerEnter={(event) => {
                        if (event.pointerType !== "touch") draft.preview(preset.id);
                      }}
                      onFocus={() => draft.preview(preset.id)}
                      onClick={() => {
                        draft.cancel();
                        const origin = engine.getSnapshot(),
                          time = transport.read().time;
                        if (origin.pageId !== page.id) return;
                        run(() => {
                          if (
                            engine.getSnapshot().project !== origin.project ||
                            engine.getSnapshot().pageId !== origin.pageId ||
                            compareMotionTime(transport.read().time, time) !== 0
                          )
                            return;
                          transport.pause();
                          engine.execute({
                            type: "applyBackgroundPreset",
                            presetId: preset.id,
                            name: t("name"),
                          });
                        });
                      }}
                    >
                      <PresetSwatch gradient={preset.gradient} />
                      <span>{preset.name}</span>
                      {preset.effects.length > 0 && (
                        <span className="studio-background-preset-recipe">
                          {preset.effects
                            .map((effect) => t(`ingredients.${effect.type}`))
                            .join(" · ")}
                        </span>
                      )}
                    </button>
                  ),
                )}
              </div>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </section>
  );
}
