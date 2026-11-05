import type { VectorDefinition } from "@musart/core";
import { prepareVectorStrokeOutlines, VectorOutlineError } from "@musart/render";
import { i18n } from "../../../state/i18n";
import "./messages";

const errorKeys = {
  partLimit: "vectorPartLimit",
  outlineLimit: "vectorOutlineLimit",
  outlineFailed: "vectorOutlineFailed",
} as const;

/** Localize renderer-owned outline preparation failures at the authoring boundary. */
export function filledVectorOutlines(
  vector: VectorDefinition,
  currentColor: string,
): VectorDefinition {
  try {
    return prepareVectorStrokeOutlines(vector, currentColor);
  } catch (cause) {
    if (!(cause instanceof VectorOutlineError)) throw cause;
    throw new Error(i18n.t(errorKeys[cause.code], { ns: "studioLibrary" }), { cause });
  }
}
