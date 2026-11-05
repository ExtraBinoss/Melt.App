import { memo, useLayoutEffect, useMemo } from "react";
import { AnimatePresence, useIsPresent } from "motion/react";
import { Settings2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { SPATIAL_NUMBERS, type EnginePort, type Layer, type SessionSnapshot } from "@musart/core";
import { useDocumentSnapshot } from "../../../state/session/use-document-snapshot";
import { motionTimeChanges } from "../../../state/session/motion-edit";
import { layerSelection } from "../../../components/layers/menu/selection";
import { useLayerPreview } from "../../../components/layers/controls/use-layer-preview";
import { MotionFieldProvider } from "../../../components/properties/motion/context";
import { MotionStringInput } from "../../../components/properties/motion/MotionStringInput";
import { FontPicker } from "../../../components/properties/fonts/FontPicker";
import { StudioPropertyPopover } from "../controls/StudioPropertyPopover";
import { IconButton } from "../../../components/shared/IconButton";
import { StudioSlider } from "../controls/StudioSlider";
import { StudioObjectPaint } from "../controls/StudioObjectPaint";
import { NumberInput } from "../../../components/shared/NumberInput";
import { StudioObjectTransform } from "./StudioObjectTransform";
import { StudioObjectField } from "./StudioObjectMotion";
import { ContextualSurface } from "../../../components/shared/motion/ContextualSurface";
import "./object-controls.css";
import "../messages";
import "../../../components/spatial/messages";

export const StudioObjectBar = memo(function StudioObjectBar({
  engine,
  run,
}: {
  engine: EnginePort;
  run: (task: () => void) => void;
}) {
  const snapshot = useDocumentSnapshot(engine, true);
  const page = snapshot.project.pages.find((item) => item.id === snapshot.pageId)!;
  const selection = layerSelection(page, snapshot.selection);
  const layer = selection.selected.length === 1 ? selection.selected[0] : undefined;
  return (
    <div className="studio-object-bar-anchor" data-canvas-control>
      <AnimatePresence mode="wait">
        {layer && (
          <StudioObjectControls
            key={`${snapshot.project.id}:${page.id}`}
            engine={engine}
            run={run}
            snapshot={snapshot}
            layer={layer}
          />
        )}
      </AnimatePresence>
    </div>
  );
});

function StudioObjectControls({
  engine,
  run,
  snapshot,
  layer,
}: {
  engine: EnginePort;
  run: (task: () => void) => void;
  snapshot: SessionSnapshot;
  layer: Layer;
}) {
  const { t: common } = useTranslation();
  const { t: spatialText } = useTranslation("spatial");
  const present = useIsPresent();
  const page = snapshot.project.pages.find((item) => item.id === snapshot.pageId)!;
  const selection = layerSelection(page, snapshot.selection);
  const identity = useMemo(
    () => ({ page, selection: snapshot.selection }),
    [page, snapshot.selection],
  );
  const edit = useLayerPreview(engine, page, snapshot.selection, run, true);
  const owner = `${page.id}:${layer.id}:${layer.kind}:${layer.spatial?.enabled ? layer.spatial.source : "flat"}`;
  const cancelEdit = edit.cancel;
  useLayoutEffect(() => {
    // Exit retention must never extend a preview's editing scope.
    cancelEdit();
  }, [cancelEdit, owner, present]);
  const current = () => {
    const next = engine.getSnapshot();
    return (
      present &&
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
  const disabled = !present || !selection.editable;
  const structure = `${owner}:${layer.name}`;
  const field = { owner, layoutKey: structure };
  return (
    <MotionFieldProvider editor={edit}>
      <ContextualSurface
        className="studio-object-bar studio-surface"
        label={layer.name}
        layoutKey={structure}
      >
        <StudioObjectField
          {...field}
          className={layer.kind === "text" ? "studio-object-text" : "studio-object-label"}
          content={layer.kind === "text" ? layer.text : layer.name}
          key={layer.kind === "text" ? "text" : "name"}
        >
          {layer.kind === "text" ? (
            <MotionStringInput
              key={owner}
              engine={engine}
              target={{ kind: "layer", layerId: layer.id, property: "text" }}
              label={common("textContent")}
              value={layer.text}
              coalescePreview
              disabled={disabled}
              onPreview={(text) => patch({ text }, false)}
              onCommit={(text) => patch({ text }, true)}
              onCancel={edit.cancel}
            />
          ) : (
            <span className="studio-object-name">{layer.name}</span>
          )}
        </StudioObjectField>
        {(layer.spatial?.enabled ||
          ["text", "vector", "rectangle", "ellipse"].includes(layer.kind)) && (
          <StudioObjectField
            {...field}
            key="paint"
            content={JSON.stringify([layer.fill, layer.fillGradient])}
            className="studio-object-paint"
          >
            <StudioObjectPaint
              key={`${layer.id}:${source?.source ?? layer.kind}`}
              engine={engine}
              layer={layer}
              disabled={disabled}
              preview={(value) => patch(value, false)}
              commit={(value) => patch(value, true)}
              cancel={edit.cancel}
            />
          </StudioObjectField>
        )}
        <div className="studio-object-basics">
          {layer.kind === "text" && (
            <StudioObjectField
              {...field}
              content={layer.fontFamily}
              className="studio-object-font"
              key="font"
            >
              {present ? (
                <FontPicker
                  key={owner}
                  layer={{ ...layer, locked: disabled }}
                  engine={engine}
                  patch={(value) => patch(value, true)}
                  preview={(value) => patch(value, false)}
                  cancel={edit.cancel}
                />
              ) : (
                <button type="button" disabled>
                  {layer.fontFamily}
                </button>
              )}
            </StudioObjectField>
          )}
          {layer.spatial?.enabled &&
            layer.spatial.source === "extrude" &&
            (["depth", "bevel"] as const).map((key) => {
              const spatial = layer.spatial!;
              return (
                <StudioObjectField {...field} content={String(spatial[key])} key={key}>
                  <StudioSlider
                    identity={identity}
                    invalidation={motionTimeChanges(engine)}
                    label={spatialText(key)}
                    value={spatial[key]}
                    min={key === "depth" ? 0.001 : 0}
                    max={key === "depth" ? 5 : 0.3}
                    step={0.01}
                    disabled={disabled}
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
                </StudioObjectField>
              );
            })}
          {layer.spatial?.enabled && layer.spatial.source !== "extrude" && (
            <StudioObjectField {...field} content={String(scaleX)} key="scale">
              <StudioSlider
                identity={identity}
                invalidation={motionTimeChanges(engine)}
                label={spatialText("scale")}
                value={Math.abs(layer.spatial.scaleX)}
                min={minimum}
                max={maximum}
                step={0.01}
                disabled={disabled || minimum === maximum}
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
            </StudioObjectField>
          )}
          {source?.enabled && source.source !== "extrude" && (
            <StudioObjectField
              {...field}
              content={`${source.rotationX}:${source.rotationY}`}
              className="studio-object-rotation"
              key="rotation"
            >
              <StudioObjectTransform
                engine={engine}
                layer={layer}
                identity={identity}
                edit={edit}
                current={current}
                disabled={disabled}
              />
            </StudioObjectField>
          )}
          {layer.kind === "text" && (
            <StudioObjectField {...field} content={String(layer.fontSize)} key="font-size">
              <StudioSlider
                identity={identity}
                invalidation={motionTimeChanges(engine)}
                label={common("fontSize")}
                value={layer.fontSize}
                min={4}
                max={600}
                step={1}
                unit="px"
                disabled={disabled}
                onStart={() => {
                  if (current())
                    edit.start({ kind: "layer", layerId: layer.id, property: "fontSize" });
                }}
                onPreview={(fontSize) => patch({ fontSize }, false)}
                onCommit={(fontSize) => patch({ fontSize }, true)}
                onCancel={edit.cancel}
              />
            </StudioObjectField>
          )}
        </div>
        {(source?.enabled || layer.kind === "text") && (
          <StudioObjectField
            {...field}
            content={source?.source ?? layer.kind}
            className="studio-object-advanced"
            key="advanced"
          >
            {present ? (
              <StudioPropertyPopover
                key={owner}
                trigger={
                  <IconButton label={spatialText("advanced")} tooltipSide="top">
                    <Settings2 size={16} />
                  </IconButton>
                }
                side="top"
                align="center"
                collisionPadding={12}
                className="studio-object-popover"
                data-canvas-control
                initialFocus="content"
              >
                <strong className="studio-field-title">{layer.name}</strong>
                {layer.kind === "text" && (
                  <div className="studio-text-bounds">
                    {(["width", "height"] as const).map((key) => (
                      <NumberInput
                        key={key}
                        identity={identity}
                        label={common(key)}
                        scrubLabel={common(key)}
                        value={layer[key]}
                        min={1}
                        max={16384}
                        step={1}
                        unit="px"
                        disabled={disabled}
                        onStart={() => {
                          if (current())
                            edit.start({ kind: "layer", layerId: layer.id, property: key });
                        }}
                        onPreview={(value) => patch({ [key]: value }, false)}
                        onCommit={(value) => patch({ [key]: value }, true)}
                        onCancel={edit.cancel}
                      />
                    ))}
                  </div>
                )}
                {source?.source === "extrude" &&
                  (["bevelSegments", "curveSegments"] as const).map((key) => (
                    <StudioSlider
                      key={key}
                      identity={identity}
                      invalidation={motionTimeChanges(engine)}
                      label={spatialText(key)}
                      value={source[key]}
                      min={SPATIAL_NUMBERS[key][0]}
                      max={SPATIAL_NUMBERS[key][1]}
                      step={1}
                      disabled={disabled}
                      onStart={() => {
                        if (current())
                          edit.start({
                            kind: "layer",
                            layerId: layer.id,
                            property:
                              key === "bevelSegments"
                                ? "spatial.bevelSegments"
                                : "spatial.curveSegments",
                          });
                      }}
                      onPreview={(value) => patch({ spatial: { ...source, [key]: value } }, false)}
                      onCommit={(value) => patch({ spatial: { ...source, [key]: value } }, true)}
                      onCancel={edit.cancel}
                    />
                  ))}
                <StudioObjectTransform
                  advanced
                  engine={engine}
                  layer={layer}
                  identity={identity}
                  edit={edit}
                  current={current}
                  disabled={disabled}
                />
              </StudioPropertyPopover>
            ) : (
              <IconButton disabled label={spatialText("advanced")} tooltipSide="top">
                <Settings2 size={16} />
              </IconButton>
            )}
          </StudioObjectField>
        )}
      </ContextualSurface>
    </MotionFieldProvider>
  );
}
