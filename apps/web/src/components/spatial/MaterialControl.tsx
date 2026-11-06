import { memo, useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { SPATIAL_MATERIALS, spatialMaterial, type EnginePort, type Layer } from "@musart/core";
import { useDocumentSnapshot } from "../../state/session/use-document-snapshot";
import { motionTimeChanges } from "../../state/session/motion-edit";
import { layerSelection } from "../layers/menu/selection";
import { useLayerPreview } from "../layers/controls/use-layer-preview";
import { MaterialPicker } from "./MaterialPicker";
import { MotionFieldProvider } from "../properties/motion/context";
import { StudioMaterialPaint } from "../../ui/studio/controls/StudioMaterialPaint";
import { SceneSpherePopover } from "./SceneSpherePopover";
import { CatalogSwatch } from "../../ui/studio/catalog/CatalogSwatch";
import { useCatalogNames } from "../../ui/studio/catalog/names";
import { StudioSlider } from "../../ui/studio/controls/StudioSlider";
import { materialParameters } from "../../ui/studio/catalog/material-parameters";
import "../../ui/studio/messages";

export const MaterialControl = memo(function MaterialControl({
  engine,
  run,
  presentation = "studio",
}: {
  engine: EnginePort;
  presentation?: "classic" | "studio";
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
  const materialIndex =
    spatial?.enabled && spatial.source !== "group"
      ? SPATIAL_MATERIALS.findIndex((item) => item.id === spatial.material.preset)
      : -1;
  // Retain only an atlas index: deselection never retains an editable layer or scene draft.
  const [swatch, setSwatch] = useState({
    projectId: snapshot.project.id,
    pageId: page.id,
    index: Math.max(0, materialIndex),
  });
  const sameSwatchOwner = swatch.projectId === snapshot.project.id && swatch.pageId === page.id;
  if (
    !sameSwatchOwner ||
    (presentation === "studio" && materialIndex >= 0 && materialIndex !== swatch.index)
  )
    setSwatch({
      projectId: snapshot.project.id,
      pageId: page.id,
      index: Math.max(0, materialIndex),
    });
  const displayedMaterialIndex =
    presentation === "studio" && materialIndex < 0 && sameSwatchOwner
      ? swatch.index
      : Math.max(0, materialIndex);
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
  function paint(value: Partial<Layer>): Partial<Layer> {
    return {
      ...value,
      ...(layer?.vector ? { vector: { ...layer.vector, preserveColors: false } } : {}),
      ...(spatial ? { spatial: { ...spatial, useModelMaterials: false } } : {}),
    };
  }
  function materialPreset(id: string, commit: boolean) {
    const material = spatialMaterial(id);
    patch(
      {
        ...(layer?.fillGradient ? {} : { fill: material.color }),
        ...(layer?.vector ? { vector: { ...layer.vector, preserveColors: false } } : {}),
        ...(spatial
          ? {
              spatial: {
                ...spatial,
                useModelMaterials: false,
                material: { ...material.settings },
              },
            }
          : {}),
      },
      commit,
    );
  }
  return (
    <SceneSpherePopover
      presentation={presentation}
      title={t("material")}
      icon={<CatalogSwatch kind="materials" index={displayedMaterialIndex} />}
      className="studio-material"
      disabled={!enabled}
      disabledHint={catalogText("select3DObject")}
    >
      {layer && spatial && enabled ? (
        <MotionFieldProvider editor={edit}>
          <div className="studio-sphere-layout">
            <section role="group" className="studio-sphere-library" aria-label={t("material")}>
              <div className="studio-panel-title">{t("material")}</div>
              <div className="studio-material-owner" title={layer.name}>
                {layer.name}
              </div>
              <MaterialPicker
                embedded
                identity={identity}
                value={spatial.material.preset}
                disabled={!selection.editable}
                onPreview={(id) => materialPreset(id, false)}
                onCancel={edit.cancel}
                onChoose={(id) => materialPreset(id, true)}
              />
            </section>
            <section
              role="group"
              className="studio-sphere-properties"
              aria-label={catalogText("materialProperties")}
            >
              <div className="studio-panel-title">{materialName(spatial.material.preset)}</div>
              <StudioMaterialPaint
                engine={engine}
                layer={layer}
                label={t("color")}
                disabled={!selection.editable}
                onPreview={(value) => patch(paint(value), false)}
                onCommit={(value) => patch(paint(value), true)}
                onCancel={edit.cancel}
              />
              {materialParameters(spatialMaterial(spatial.material.preset).category).map((key) => (
                <StudioSlider
                  key={key}
                  identity={identity}
                  invalidation={motionTimeChanges(engine)}
                  label={spatialText(key)}
                  value={spatial.material[key]}
                  resetValue={spatialMaterial(spatial.material.preset).settings[key]}
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
    </SceneSpherePopover>
  );
});
