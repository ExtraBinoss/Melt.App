import { useSyncExternalStore, useState } from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "jotai";
import {
  createEffect,
  createLayer,
  createPage,
  createProject,
  EditorEngine,
  getEffectDefinition,
  type EffectType,
} from "../../../packages/core/src/index";
import { EffectParameters } from "../../../apps/web/src/components/properties/effects/EffectParameters";
import {
  DriverRangeFields,
  type DriverRange,
} from "../../../apps/web/src/components/properties/effects/effect-motion/DriverRange";
import { effectMotionProperties } from "../../../apps/web/src/components/properties/effects/effect-motion/authoring";
import { StudioEffectCatalog } from "../../../apps/web/src/ui/studio/effects/StudioEffectCatalog";
import { TooltipProvider } from "../../../apps/web/src/components/ui/tooltip";
import { WorkspaceTheme } from "../../../apps/web/src/ui/brand/WorkspaceTheme";
import { useTranslation } from "react-i18next";
import { changeLanguage, i18n } from "../../../apps/web/src/state/i18n";
import type { Locale } from "../../../apps/web/src/state/i18n/locales";
import "../../../apps/web/src/components/properties/effects/library-messages";
import "../../../apps/web/src/components/properties/effects/effect-motion/messages";
import "../../../apps/web/src/styles/global.css";

export async function mountEffectLocales(
  language: Locale,
  type: EffectType = "wave-distortion",
  propertyKey = "waveform",
) {
  await changeLanguage(language);
  document.documentElement.classList.add("dark");
  const layer = createLayer("rectangle", { effects: [createEffect(type)] });
  const engine = new EditorEngine(createProject({ pages: [createPage({ layers: [layer] })] }));
  const host = document.body.appendChild(document.createElement("main"));
  host.style.cssText = "padding:16px;max-width:380px;background:var(--background);min-height:100vh";
  createRoot(host).render(
    <Provider>
      <WorkspaceTheme value="studio">
        <TooltipProvider>
          <Witness engine={engine} propertyKey={propertyKey} />
        </TooltipProvider>
      </WorkspaceTheme>
    </Provider>,
  );
  const definition = getEffectDefinition(type);
  const parameter = definition.parameters.find((parameter) => parameter.key === propertyKey)!;
  return {
    name: i18n.t(definition.nameKey),
    parameter: i18n.t(parameter.labelKey),
    choices:
      parameter.kind === "select" ? parameter.options.map((option) => i18n.t(option.labelKey)) : [],
    from: i18n.t("effectMotion:from"),
    search: i18n.t("effectCatalog:search"),
  };
}
function Witness({ engine, propertyKey }: { engine: EditorEngine; propertyKey: string }) {
  const { t } = useTranslation();
  const snapshot = useSyncExternalStore(engine.subscribe, engine.getSnapshot, engine.getSnapshot);
  const layer = snapshot.project.pages[0]!.layers[0]!,
    effect = layer.effects[0]!;
  const property = effectMotionProperties(engine, effect).find(
    (p) => p.target.property === propertyKey,
  )!;
  const [range, setRange] = useState<DriverRange>(
    property.kind === "choice"
      ? [property.options[0]!, property.options[1] ?? property.options[0]!]
      : [property.value, property.value],
  );
  return (
    <>
      <section aria-label={t("effects")}>
        <h2>{t(getEffectDefinition(effect.type).nameKey)}</h2>
        <EffectParameters
          engine={engine}
          layerId={layer.id}
          effect={effect}
          onChange={(patch, preview) => {
            if (!preview)
              engine.execute({
                type: "updateLayers",
                ids: [layer.id],
                patch: { effects: [{ ...effect, ...patch }] },
              });
          }}
        />
      </section>
      <section aria-label={t("effectMotion:title")}>
        <h2>{t("effectMotion:title")}</h2>
        <DriverRangeFields
          effect={effect}
          property={property}
          value={range}
          disabled={false}
          onChange={setRange}
        />
      </section>
      <section aria-label={t("effectCatalog:search")}>
        <StudioEffectCatalog category="effect" disabled={false} onAdd={() => {}} />
      </section>
    </>
  );
}
