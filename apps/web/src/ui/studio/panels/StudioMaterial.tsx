import { memo, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { SPATIAL_MATERIALS, spatialMaterial, type EnginePort, type Layer } from "@musart/core";
import { useDocumentSnapshot } from "../../../state/session/use-document-snapshot";
import { motionTimeChanges } from "../../../state/session/motion-edit";
import { layerSelection } from "../../../components/layers/menu/selection";
import { useLayerPreview } from "../../../components/layers/controls/use-layer-preview";
import { MaterialPicker } from "../../../components/spatial/MaterialPicker";
import { MotionColorControl } from "../../../components/properties/motion/MotionColorControl";
import { MotionFieldProvider } from "../../../components/properties/motion/context";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "../../../components/ui/accordion";
import { StudioSphereDock } from "../controls/StudioSphereDock";
import { CatalogSwatch } from "../catalog/CatalogSwatch";
import { useCatalogNames } from "../catalog/names";
import { StudioSlider } from "../controls/StudioSlider";
import { materialParameters } from "../catalog/material-parameters";
import "../messages";

export const StudioMaterial = memo(function StudioMaterial({
  engine,
  run,
}: {
  engine: EnginePort;
  run: (task: () => void) => void;
}) {
  const { t } = useTranslation("studioChrome");
  const { t: spatialText } = useTranslation("spatial");
  const { t: catalogText } = useTranslation("studioCatalog");
  const { materialName } = useCatalogNames();
  const snapshot = useDocumentSnapshot(engine, true);
  const page = snapshot.project.pages.find((item) => item.id === snapshot.pageId)!;
  const selection = layerSelection(page, snapshot.selection);
  const layer = selection.selected.length === 1 ? selection.selected[0] : undefined;
  const spatial = layer?.spatial;
  const enabled = Boolean(spatial?.enabled && spatial.source !== "group" && selection.editable);
  const materialIndex = SPATIAL_MATERIALS.findIndex((item) => item.id === spatial?.material.preset);
  const identity = useMemo(
    () => ({ page, selection: snapshot.selection }),
    [page, snapshot.selection],
  );
  const current = useCallback(() => {
    const next = engine.getSnapshot();
    return (
      next.project === snapshot.project &&
      next.pageId === snapshot.pageId &&
      next.selection === snapshot.selection
    );
  }, [engine, snapshot.project, snapshot.pageId, snapshot.selection]);
  const edit = useLayerPreview(engine, page, snapshot.selection, run, true);
  function patch(value: Partial<Layer>, commit: boolean) {
    if (!current() || !selection.editable) return edit.cancel();
    if (commit) edit.commit(value);
    else edit.previewLayer(value);
  }
  function tint(fill: string): Partial<Layer> {
    return {
      fill,
      ...(layer?.vector ? { vector: { ...layer.vector, preserveColors: false } } : {}),
      ...(spatial ? { spatial: { ...spatial, useModelMaterials: false } } : {}),
    };
  }
  return (
    <StudioSphereDock
      title={t("material")}
      icon={<CatalogSwatch kind="materials" index={Math.max(0, materialIndex)} />}
      className="studio-material"
      disabled={!enabled}
      disabledHint={catalogText("select3DObject")}
    >
      {layer && spatial && enabled ? (
        <MotionFieldProvider editor={edit}>
          <div className="studio-sphere-layout">
            <section className="studio-sphere-library" aria-label={t("material")}>
              <div className="studio-panel-title">{t("material")}</div>
              <div className="studio-material-owner" title={layer.name}>
                {layer.name}
              </div>
              <MaterialPicker
                embedded
                value={spatial.material.preset}
                disabled={!selection.editable}
                onChoose={(id) => {
                  const material = spatialMaterial(id);
                  patch(
                    {
                      fill: material.color,
                      ...(layer.vector
                        ? { vector: { ...layer.vector, preserveColors: false } }
                        : {}),
                      spatial: {
                        ...spatial,
                        useModelMaterials: false,
                        material: { ...material.settings },
                      },
                    },
                    true,
                  );
                }}
              />
            </section>
            <section
              className="studio-sphere-properties"
              aria-label={catalogText("materialProperties")}
            >
              <div className="studio-panel-title">{materialName(spatial.material.preset)}</div>
              <Accordion type="single" collapsible className="studio-color-disclosure">
                <AccordionItem value="color">
                  <AccordionTrigger>{t("color")}</AccordionTrigger>
                  <AccordionContent>
                    <MotionColorControl
                      engine={engine}
                      target={{ kind: "layer", layerId: layer.id, property: "fill" }}
                      label={t("color")}
                      value={layer.fill}
                      identity={layer.id}
                      disabled={!selection.editable}
                      onPreview={(fill) => patch(tint(fill), false)}
                      onCommit={(fill) => patch(tint(fill), true)}
                      onCancel={edit.cancel}
                    />
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
              {materialParameters(spatialMaterial(spatial.material.preset).category).map((key) => (
                <StudioSlider
                  key={key}
                  identity={identity}
                  invalidation={motionTimeChanges(engine)}
                  label={spatialText(key)}
                  value={spatial.material[key]}
                  min={0}
                  max={key === "emissiveIntensity" ? 5 : 1}
                  disabled={!selection.editable}
                  onStart={() =>
                    edit.start({
                      kind: "layer",
                      layerId: layer.id,
                      property: `spatial.material.${key}`,
                    })
                  }
                  onPreview={(value) =>
                    patch(
                      {
                        spatial: {
                          ...spatial,
                          useModelMaterials: false,
                          material: { ...spatial.material, [key]: value },
                        },
                      },
                      false,
                    )
                  }
                  onCommit={(value) =>
                    patch(
                      {
                        spatial: {
                          ...spatial,
                          useModelMaterials: false,
                          material: { ...spatial.material, [key]: value },
                        },
                      },
                      true,
                    )
                  }
                  onCancel={edit.cancel}
                />
              ))}
            </section>
          </div>
        </MotionFieldProvider>
      ) : (
        <p className="studio-hint">{t("selectObject")}</p>
      )}
    </StudioSphereDock>
  );
});
