import type { EnginePort } from "@musart/core";
import type { PixelSelectionPort } from "./preview";
import { i18n } from "../../state/i18n";
import "./wand/messages";

/** The same configurable command serves pixel selections and whole editable layers. */
export async function layerViaCopy(engine: EnginePort, pixels?: PixelSelectionPort) {
  if (pixels?.read()) {
    await pixels.copyPixels();
    return;
  }
  const ids = engine.getSnapshot().selection;
  if (ids.length)
    engine.execute({
      type: "duplicateLayers",
      ids,
      inPlace: true,
      nameSuffix: i18n.t("pixelSelection:copySuffix"),
    });
}
