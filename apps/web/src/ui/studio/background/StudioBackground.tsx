import { useCallback, useRef } from "react";
import { useSetAtom } from "jotai";
import { Layers, Paintbrush, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Composition, EnginePort, Layer } from "@musart/core";
import type { TaskRunner } from "../../../components/projects/ProjectDialog";
import { useDocumentSnapshot } from "../../../state/session/use-document-snapshot";
import { previewAtom } from "../../../state/session/editor";
import { Popover, PopoverContent, PopoverTrigger } from "../../../components/ui/popover";
import { Button } from "../../../components/ui/button";
import { BackgroundPaintControls } from "../../../components/properties/gradient/BackgroundPaintControls";
import { GradientControl } from "../../../components/properties/gradient/GradientControl";
import { StudioBackgroundPaint } from "./StudioBackgroundPaint";
import { IconButton } from "../../../components/shared/IconButton";
import { MotionFieldProvider } from "../../../components/properties/motion/context";
import { EffectsPanel } from "../../../components/properties/EffectsPanel";
import { useLayerPreview } from "../../../components/layers/controls/use-layer-preview";
import { BackgroundPresets } from "./BackgroundPresets";
import { backgroundLayer, createBackgroundLayer } from "./model";
import "./messages";
import "./background.css";

export function StudioBackground({ engine, onTask }: { engine: EnginePort; onTask: TaskRunner }) {
  const { t } = useTranslation("studioBackground");
  return (
    <Popover modal={false}>
      <PopoverTrigger asChild>
        <IconButton
          label={t("title")}
          tooltipSide="top"
          className="studio-background-trigger studio-surface"
        >
          <Paintbrush size={19} />
        </IconButton>
      </PopoverTrigger>
      <PopoverContent
        side="left"
        align="end"
        collisionPadding={12}
        className="studio-background-popover"
        data-canvas-control
        aria-label={t("title")}
        initialFocus="content"
      >
        <BackgroundEditor engine={engine} onTask={onTask} />
      </PopoverContent>
    </Popover>
  );
}
function BackgroundEditor({ engine, onTask }: { engine: EnginePort; onTask: TaskRunner }) {
  const { t } = useTranslation("studioBackground");
  const snapshot = useDocumentSnapshot(engine, true);
  const page = snapshot.project.pages.find((item) => item.id === snapshot.pageId)!;
  const layer = backgroundLayer(page);
  const setPreview = useSetAtom(previewAtom);
  const cancel = useCallback(() => setPreview(null), [setPreview]);
  const run = useCallback(
    (task: () => void) => {
      void onTask(task);
    },
    [onTask],
  );
  const origin = useRef(snapshot.project.id);
  const current = () =>
    engine.getSnapshot().project.id === origin.current &&
    engine.getSnapshot().pageId === page.id &&
    engine.getSnapshot().project.pages.find((item) => item.id === page.id) === page;
  return (
    <div className="studio-background-editor">
      <div className="studio-background-heading">
        <Paintbrush size={15} />
        <strong>{t(layer ? "layer" : "canvas")}</strong>
      </div>

      {layer ? (
        <LayerBackground key={layer.id} engine={engine} page={page} layer={layer} run={run} />
      ) : (
        <>
          <StudioBackgroundPaint
            engine={engine}
            identity={page}
            ownerId={`${snapshot.project.id}:${page.id}:${snapshot.revision}`}
            color={page.background}
            gradient={page.backgroundGradient}
            preview={({ color, gradient }) => {
              if (current())
                setPreview({
                  target: "page",
                  patch: { background: color, backgroundGradient: gradient },
                });
            }}
            commit={({ color, gradient }) => {
              cancel();
              if (current())
                run(() => {
                  if (
                    engine.getSnapshot().project.pages.find((item) => item.id === page.id) === page
                  )
                    engine.execute({
                      type: "updatePage",
                      patch: { background: color, backgroundGradient: gradient },
                    });
                });
            }}
            cancel={cancel}
            advanced={
              <BackgroundPaintControls
                engine={engine}
                page={page}
                current={current}
                run={run}
                cancel={cancel}
              />
            }
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              run(() => {
                if (current()) createBackgroundLayer(engine, t("name"));
              })
            }
          >
            <Sparkles size={14} />
            {t("convert")}
          </Button>
        </>
      )}
      <BackgroundPresets engine={engine} page={page} run={run} />
    </div>
  );
}
function LayerBackground({
  engine,
  page,
  layer,
  run,
}: {
  engine: EnginePort;
  page: Composition;
  layer: Layer;
  run: (task: () => void) => void;
}) {
  const { t } = useTranslation("studioBackground");
  const edit = useLayerPreview(engine, page, [layer.id], run, false);
  return (
    <MotionFieldProvider editor={edit}>
      {layer.locked && <p className="studio-background-hint">{t("locked")}</p>}
      <fieldset disabled={layer.locked} className="studio-background-fields">
        <StudioBackgroundPaint
          engine={engine}
          identity={layer}
          ownerId={`${engine.getSnapshot().project.id}:${layer.id}:${engine.getSnapshot().revision}`}
          color={layer.fill}
          gradient={layer.fillGradient}
          disabled={layer.locked}
          preview={({ color, gradient }) =>
            edit.previewLayer({ fill: color, fillGradient: gradient })
          }
          commit={({ color, gradient }) => edit.commit({ fill: color, fillGradient: gradient })}
          cancel={edit.cancel}
          advanced={
            <GradientControl
              layer={layer}
              engine={engine}
              patch={edit.commit}
              preview={edit.previewLayer}
              cancel={edit.cancel}
            />
          }
        />
        <EffectsPanel
          engine={engine}
          layer={layer}
          onPatch={edit.commit}
          onPreview={edit.previewLayer}
          onCancel={edit.cancel}
        />
      </fieldset>
      <Button variant="ghost" size="sm" onClick={() => engine.select([layer.id])}>
        <Layers size={14} />
        {t("select")}
      </Button>
    </MotionFieldProvider>
  );
}
