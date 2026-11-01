import { MOTION_TEMPLATE_ASSET_REVISIONS } from "./motion/asset-revisions";
import { beginProjectTiming } from "../../performance/project-timing";
import { PRESETS } from "@musart/core/presets";
import type { EditorServices } from "../../../state/contracts";
import type { TemplateLoadOptions } from "./motion/loader";
import { isMotionTemplateId } from "./motion/identity";
import { isDesignedTemplateId } from "./designed/catalog";

export interface ProjectTemplate {
  readonly id: string;
  readonly nameKey: string;
  readonly width: number;
  readonly height: number;
  readonly brandId?: string;
  readonly preview?: string;
  readonly previewBackground?: string;
  readonly category: "artwork" | "social" | "video" | "print" | "screen";
  readonly mode: "static" | "motion";
  readonly descriptionKey: string;
}
export const TEMPLATE_CATALOG: readonly ProjectTemplate[] = Object.freeze([
  Object.freeze({
    id: "second-skin",
    nameKey: "templates:secondSkin",
    descriptionKey: "libraryContents:description.second-skin",
    width: 1080,
    height: 1920,
    mode: "motion",
    category: "artwork",
    previewBackground: "#08090b",
    preview: `${import.meta.env.BASE_URL}templates/motion/second-skin/second-skin.webp?v=${MOTION_TEMPLATE_ASSET_REVISIONS["second-skin"]!}`,
  }),
  Object.freeze({
    id: "terminal-signal",
    nameKey: "templates:terminalSignal",
    descriptionKey: "libraryContents:description.terminal-signal",
    width: 1080,
    height: 1920,
    mode: "motion",
    category: "video",
    previewBackground: "#030703",
    preview: `${import.meta.env.BASE_URL}templates/motion/terminal-signal/terminal-signal.webp?v=${MOTION_TEMPLATE_ASSET_REVISIONS["terminal-signal"]!}`,
  }),
  Object.freeze({
    id: "angel-windows",
    nameKey: "templates:angelWindows",
    descriptionKey: "libraryContents:description.angel-windows",
    width: 1080,
    height: 1920,
    mode: "motion",
    category: "artwork",
    preview: `${import.meta.env.BASE_URL}templates/motion/angel-windows/angel-windows.webp?v=${MOTION_TEMPLATE_ASSET_REVISIONS["angel-windows"]!}`,
  }),
  Object.freeze({
    id: "cornell-box",
    nameKey: "templates:cornellBox",
    descriptionKey: "libraryContents:description.cornell-box",
    width: 1080,
    height: 1080,
    mode: "motion",
    category: "artwork",
    preview: `${import.meta.env.BASE_URL}templates/motion/cornell-box/cornell-box.webp?v=${MOTION_TEMPLATE_ASSET_REVISIONS["cornell-box"]!}`,
  }),
  Object.freeze({
    id: "bloom-windows",
    nameKey: "templates:bloomWindows",
    descriptionKey: "libraryContents:description.bloom-windows",
    width: 1920,
    height: 1080,
    mode: "motion",
    category: "video",
    preview: `${import.meta.env.BASE_URL}templates/motion/bloom-windows/bloom-windows.webp?v=${MOTION_TEMPLATE_ASSET_REVISIONS["bloom-windows"]!}`,
  }),
  Object.freeze({
    id: "morphing-type",
    previewBackground: "#ffffff",
    nameKey: "templates:morphingType",
    descriptionKey: "libraryContents:description.morphing-type",
    width: 1920,
    height: 1080,
    mode: "motion",
    category: "artwork",
    preview: `${import.meta.env.BASE_URL}templates/motion/morphing-type/morphing-type.webp?v=${MOTION_TEMPLATE_ASSET_REVISIONS["morphing-type"]!}`,
  }),

  Object.freeze({
    id: "share-your-work",
    nameKey: "templates:shareYourWork",
    width: 480,
    height: 480,
    category: "artwork" as const,
    mode: "motion" as const,
    descriptionKey: "libraryContents:description.share-your-work",
    preview: `${import.meta.env.BASE_URL}templates/motion/share-your-work/share-your-work.webp?v=haunt-loop-1`,
  }),
  ...PRESETS.map((preset) =>
    Object.freeze({
      id: `preset:${preset.id}`,
      nameKey: preset.nameKey,
      width: preset.width,
      height: preset.height,
      brandId: preset.brandId,
      category: preset.category,
      mode: "static" as const,
      descriptionKey: "libraryContents:description.blank",
    }),
  ),
]);

/** Creates an independent, durably saved project through the normal validated service ports. */
async function openProjectTemplate(
  services: Pick<EditorServices, "createProject" | "openPortable" | "openMediaProject">,
  templateId: string,
  options: TemplateLoadOptions = {},
): Promise<void> {
  options.signal?.throwIfAborted();
  if (isDesignedTemplateId(templateId)) {
    const { openDesignedTemplate } = await import("./designed/load");
    await openDesignedTemplate(services, templateId, options);
    return;
  }
  if (isMotionTemplateId(templateId)) {
    const { openMotionTemplate } = await import("./motion/loader");
    await openMotionTemplate(services, templateId, options);
    return;
  }
  if (templateId === "afterhours-techno") {
    const { createProject, serializeProject } = await import("@musart/core");
    const { createTechnoArtboard } = await import("./afterhours-techno/build");
    const project = createProject({
      id: crypto.randomUUID(),
      name: "AFTERHOURS — Techno",
      pages: [createTechnoArtboard()],
    });
    await services.openPortable(
      new File([serializeProject(project)], "afterhours.musart", { type: "application/json" }),
    );
    return;
  }
  const preset = PRESETS.find((item) => `preset:${item.id}` === templateId);
  if (!preset) throw new Error("Unknown project template.");
  await services.createProject({
    presetId: preset.id,
    name: preset.name,
    width: preset.width,
    height: preset.height,
    background: "#ffffff",
  });
}

/** One timing follows the whole template operation, including the native first frame. */
export async function createProjectFromTemplate(
  services: Pick<EditorServices, "createProject" | "openPortable" | "openMediaProject">,
  templateId: string,
  options: TemplateLoadOptions = {},
): Promise<void> {
  const timing = options.timing ?? beginProjectTiming("Open template", { templateId });
  timing?.stage("Resolve template");
  try {
    await openProjectTemplate(services, templateId, { ...options, ...(timing ? { timing } : {}) });
    if (!timing?.waitingForFrame) timing?.finish("published");
  } catch (error) {
    timing?.finish(options.signal?.aborted ? "cancelled" : "failed", error);
    throw error;
  }
}
