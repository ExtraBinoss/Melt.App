import type { ProjectTemplate } from "../catalog";
import { DESIGNED_TEMPLATES } from "../designed/catalog";

/** Retired gallery designs remain internal regression workloads and legacy URL sources. */
export const RETIRED_TEMPLATE_FIXTURES: readonly ProjectTemplate[] = Object.freeze([
  Object.freeze({
    id: "afterhours-techno",
    nameKey: "templates:afterhours",
    width: 1080,
    height: 1920,
    category: "artwork" as const,
    mode: "static" as const,
    descriptionKey: "templates:editable",
    preview: `${import.meta.env.BASE_URL}templates/afterhours-techno/afterhours.webp`,
  }),
  Object.freeze({
    id: "in-bloom",
    nameKey: "templates:bloom",
    width: 1440,
    height: 1040,
    category: "artwork" as const,
    mode: "motion" as const,
    descriptionKey: "templates:bloomDescription",
    preview: `${import.meta.env.BASE_URL}templates/motion/in-bloom/in-bloom.webp`,
  }),
  Object.freeze({
    id: "motion-stress-lab",
    nameKey: "templates:stress",
    width: 1440,
    height: 1200,
    category: "artwork" as const,
    mode: "motion" as const,
    descriptionKey: "templates:stressDescription",
    preview: `${import.meta.env.BASE_URL}templates/motion/motion-stress-lab/motion-stress-lab.webp`,
  }),
  Object.freeze({
    id: "sound-playground",
    nameKey: "templates:soundPlayground",
    width: 1080,
    height: 1080,
    category: "artwork" as const,
    mode: "motion" as const,
    descriptionKey: "templates:soundPlaygroundDescription",
    preview: `${import.meta.env.BASE_URL}templates/motion/sound-playground/sound-playground.webp`,
  }),
  ...DESIGNED_TEMPLATES.filter((template) => template.id !== "studio-starter"),
]);
