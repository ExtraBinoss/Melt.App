import { memo, useMemo } from "react";
import { SlidersHorizontal } from "lucide-react";
import { useTranslation } from "react-i18next";
import { SPATIAL_NUMBERS, type EnginePort, type Layer } from "@musart/core";
import { useDocumentSnapshot } from "../../../state/session/use-document-snapshot";
import { motionTimeChanges } from "../../../state/session/motion-edit";
import { layerSelection } from "../../../components/layers/menu/selection";
import { useLayerPreview } from "../../../components/layers/controls/use-layer-preview";
import { MotionFieldProvider } from "../../../components/properties/motion/context";
import { MotionStringInput } from "../../../components/properties/motion/MotionStringInput";
import { FontPicker } from "../../../components/properties/fonts/FontPicker";
import { Popover, PopoverContent, PopoverTrigger } from "../../../components/ui/popover";
import { Button } from "../../../components/ui/button";
import { StudioSlider } from "../controls/StudioSlider";
import "../messages";
import "../../../components/spatial/messages";

export const StudioObjectBar = memo(function StudioObjectBar({
  engine,
  run,
}: {
  engine: EnginePort;
  run: (task: () => void) => void;
}) {
  const { t: common } = useTranslation();
  const { t: spatialText } = useTranslation("spatial");
  const snapshot = useDocumentSnapshot(engine, true);
  const page = snapshot.project.pages.find((item) => item.id === snapshot.pageId)!;
  const selection = layerSelection(page, snapshot.selection);
  const layer = selection.selected.length === 1 ? selection.selected[0] : undefined;
  const identity = useMemo(
    () => ({ page, selection: snapshot.selection }),
    [page, snapshot.selection],
  );
  const edit = useLayerPreview(engine, page, snapshot.selection, run, true);
  const current = () => {
    const next = engine.getSnapshot();
    return (
      next.project === snapshot.project &&
      next.pageId === page.id &&
      next.selection === snapshot.selection
    );
  };
  const patch = (value: Partial<Layer>, commit: boolean) => {
    if (!current() || !selection.editable) return;
    if (commit) edit.commit(value);
    else edit.previewLayer(value);
  };
  if (!layer) return null;
  const source = layer.spatial;
  const scaleX = source?.scaleX ?? 1;
  const axes = source ? [source.scaleX, source.scaleY, source.scaleZ] : [1];
  const minimum = Math.min(
    scaleX,
    Math.ceil(((scaleX * SPATIAL_NUMBERS.scaleX[0]) / Math.min(...axes)) * 100) / 100,
  );
  const maximum = Math.max(
    scaleX,
    Math.min(
      50,
      Math.floor(((scaleX * SPATIAL_NUMBERS.scaleX[1]) / Math.max(...axes)) * 100) / 100,
    ),
  );
  return (
    <MotionFieldProvider editor={edit}>
      <div className="studio-object-bar studio-surface" data-canvas-control aria-label={layer.name}>
        {layer.kind === "text" ? (
          <MotionStringInput
            engine={engine}
            target={{ kind: "layer", layerId: layer.id, property: "text" }}
            label={common("textContent")}
            value={layer.text}
            disabled={!selection.editable}
            onPreview={(text) => patch({ text }, false)}
            onCommit={(text) => patch({ text }, true)}
            onCancel={edit.cancel}
          />
        ) : (
          <span className="studio-object-name">{layer.name}</span>
        )}
        <Popover modal={false}>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm">
              <SlidersHorizontal size={15} />
              {common("properties")}
            </Button>
          </PopoverTrigger>
          <PopoverContent
            side="top"
            align="center"
            collisionPadding={12}
            className="studio-object-popover"
            data-canvas-control
            initialFocus="content"
          >
            <strong className="studio-field-title">{layer.name}</strong>
            {layer.kind === "text" && (
              <FontPicker
                layer={{ ...layer, locked: !selection.editable }}
                engine={engine}
                patch={(value) => patch(value, true)}
                preview={(value) => patch(value, false)}
                cancel={edit.cancel}
              />
            )}
            {layer.spatial?.enabled &&
              layer.spatial.source === "extrude" &&
              (["depth", "bevel"] as const).map((key) => {
                const spatial = layer.spatial!;
                return (
                  <StudioSlider
                    key={key}
                    identity={identity}
                    invalidation={motionTimeChanges(engine)}
                    label={spatialText(key)}
                    value={spatial[key]}
                    min={key === "depth" ? 0.001 : 0}
                    max={key === "depth" ? 5 : 0.3}
                    step={0.01}
                    disabled={!selection.editable}
                    onStart={() => {
                      if (current())
                        edit.start({
                          kind: "layer",
                          layerId: layer.id,
                          property: key === "depth" ? "spatial.depth" : "spatial.bevel",
                        });
                    }}
                    onPreview={(value) => patch({ spatial: { ...spatial, [key]: value } }, false)}
                    onCommit={(value) => patch({ spatial: { ...spatial, [key]: value } }, true)}
                    onCancel={edit.cancel}
                  />
                );
              })}
            {layer.spatial?.enabled && layer.spatial.source !== "extrude" && (
              <StudioSlider
                identity={identity}
                invalidation={motionTimeChanges(engine)}
                label={spatialText("scale")}
                value={Math.abs(layer.spatial.scaleX)}
                min={minimum}
                max={maximum}
                step={0.01}
                disabled={!selection.editable || minimum === maximum}
                onStart={() => {
                  if (current())
                    edit.start({ kind: "layer", layerId: layer.id, property: "spatial.scaleX" });
                }}
                onPreview={(value) => {
                  const spatial = layer.spatial!;
                  const factor = value / Math.max(0.0001, Math.abs(spatial.scaleX));
                  patch(
                    {
                      spatial: {
                        ...spatial,
                        scaleX: spatial.scaleX * factor,
                        scaleY: spatial.scaleY * factor,
                        scaleZ: spatial.scaleZ * factor,
                      },
                    },
                    false,
                  );
                }}
                onCommit={(value) => {
                  const spatial = layer.spatial!;
                  const factor = value / Math.max(0.0001, Math.abs(spatial.scaleX));
                  patch(
                    {
                      spatial: {
                        ...spatial,
                        scaleX: spatial.scaleX * factor,
                        scaleY: spatial.scaleY * factor,
                        scaleZ: spatial.scaleZ * factor,
                      },
                    },
                    true,
                  );
                }}
                onCancel={edit.cancel}
              />
            )}
            {layer.kind === "text" && (
              <StudioSlider
                identity={identity}
                invalidation={motionTimeChanges(engine)}
                label={common("fontSize")}
                value={layer.fontSize}
                min={4}
                max={600}
                step={1}
                unit="px"
                disabled={!selection.editable}
                onStart={() => {
                  if (current())
                    edit.start({ kind: "layer", layerId: layer.id, property: "fontSize" });
                }}
                onPreview={(fontSize) => patch({ fontSize }, false)}
                onCommit={(fontSize) => patch({ fontSize }, true)}
                onCancel={edit.cancel}
              />
            )}
          </PopoverContent>
        </Popover>
      </div>
    </MotionFieldProvider>
  );
});
