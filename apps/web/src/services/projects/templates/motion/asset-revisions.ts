import type { MotionTemplateId } from "./model";
/** Change poster and portable source together so a new visual cannot play an older cached document. */
export const MOTION_TEMPLATE_ASSET_REVISIONS: Readonly<Partial<Record<MotionTemplateId, string>>> =
  Object.freeze({
    "terminal-signal": "1",
    "angel-windows": "1",
    "cornell-box": "4",
    "bloom-windows": "9-077a64327a2c",
    "morphing-type": "dynapuff-2a3be0a7749b",
  });

/** Optional raw-media derivatives; treatments still use the native live render graph. */
export const MOTION_TEMPLATE_PREVIEW_REVISIONS: Readonly<
  Partial<Record<MotionTemplateId, string>>
> = Object.freeze({ "bloom-windows": "9-077a64327a2c" });
