import type { MotionTemplateId } from "./model";
/** Change poster and portable source together so a new visual cannot play an older cached document. */
export const MOTION_TEMPLATE_ASSET_REVISIONS: Readonly<Partial<Record<MotionTemplateId, string>>> =
  Object.freeze({
    "morphing-type": "melt-lettering-2",
  });
