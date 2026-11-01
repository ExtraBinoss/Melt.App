import { TEMPLATE_CATALOG } from "../catalog";
import { RETIRED_TEMPLATE_FIXTURES } from "../fixtures/catalog";
import type { MotionTemplateId } from "./model";
/** Gallery entries and retired regression sources share the validated loading boundary. */
export function isMotionTemplateId(id: string): id is MotionTemplateId {
  return [TEMPLATE_CATALOG, RETIRED_TEMPLATE_FIXTURES].some((catalog) =>
    catalog.some((item) => item.id === id && item.mode === "motion"),
  );
}
