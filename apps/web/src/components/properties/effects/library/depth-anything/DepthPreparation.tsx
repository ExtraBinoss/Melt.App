import { useSyncExternalStore } from "react";
import type { Effect, EnginePort } from "@musart/core";
import { useTranslation } from "react-i18next";
import { Button } from "../../../../ui/button";
import { depthPreparationFor } from "../../../../../services/depth/controller";
import { canPrepareDepth } from "../../../../../services/depth/service";
const emptySubscribe = () => () => {},
  emptyRead = () => null;
/** The existing application tool panel owns the visible job, independently of this inspector. */
export function DepthPreparation({
  engine,
  layerId,
  effect,
  disabled,
}: {
  engine?: EnginePort;
  layerId?: string;
  effect: Effect;
  disabled: boolean;
}) {
  const { t } = useTranslation("depth-anythingFx");
  const port = engine ? depthPreparationFor(engine) : undefined;
  const state = useSyncExternalStore(
    port?.subscribe ?? emptySubscribe,
    port?.read ?? emptyRead,
    emptyRead,
  );
  return (
    <Button
      variant="outline"
      disabled={
        disabled ||
        !!state?.busy ||
        !engine ||
        !layerId ||
        !port ||
        !canPrepareDepth(engine, layerId)
      }
      onClick={() => {
        if (port && layerId) void port.request(layerId, effect);
      }}
    >
      {t(effect.inputs?.depth ? "regenerate" : "download")}
    </Button>
  );
}
