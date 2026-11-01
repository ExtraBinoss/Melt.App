import { createOrbitStudy } from "./orbit-study/build";
import { createPaperMotion } from "./paper-motion/build";
import { createColorfield } from "./colorfield/build";
import { createTransitionAtlas } from "./transition-atlas/build";
import type { DesignedTemplateId } from "./catalog";

const builders = {
  "orbit-study": createOrbitStudy,
  "paper-motion": createPaperMotion,
  colorfield: createColorfield,
  "transition-atlas": createTransitionAtlas,
} as const;
/** No UI, storage, media decoder or GPU is involved in authoring these portable documents. */
export function buildDesignedTemplate(id: DesignedTemplateId) {
  return builders[id]();
}
