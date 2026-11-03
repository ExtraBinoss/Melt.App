export const steps = [
  {
    id: "canvas",
    target: '.canvas-artboard-editor[data-active="true"]',
  },
  {
    id: "tools",
    target: ".toolbar",
  },
  {
    id: "properties",
    target: ".inspector-tabs",
  },
  {
    id: "layers",
    target: ".layers-panel",
    action: "select",
  },
  {
    id: "effectMenu",
    target: ".layer-create-actions",
    action: "effectMenu",
  },
  {
    id: "effectCategory",
    target: '[data-effect-menu-category="effect"]',
    action: "effectCategory",
  },
  {
    id: "dither",
    target: '[data-effect-catalog-item="dither"]',
    action: "dither",
  },
  {
    id: "recenter",
    target: '.canvas-artboard-editor[data-active="true"]',
  },
  {
    id: "modes",
    target: ".motion-mode",
  },
  {
    id: "motion",
    target: '.motion-mode [data-segmented-value="motion"]',
    action: "motion",
  },
  {
    id: "context",
    target: '.canvas-selection[data-layer-kind="image"]',
    action: "context",
  },
  {
    id: "transition",
    target: '[data-tutorial="add-transition"]',
    action: "transition",
  },
  {
    id: "pop",
    target: '[data-preset-id="scale-pop"]',
    action: "pop",
  },
  {
    id: "pin",
    target: '[data-tutorial="timeline-pin"]',
    action: "pin",
  },
  {
    id: "timeline",
    target: '.motion-timeline-dock[data-motion-pinned="true"]',
  },
  {
    id: "play",
    target: ".motion-transport button",
    action: "play",
  },
  {
    id: "export",
    target: "[data-inspector-export-trigger]",
    action: "export",
  },
  {
    id: "exportWindow",
    target: ".export-workspace",
  },
  {
    id: "video",
    target: '.export-dialog [data-segmented-value="motion"]',
    action: "video",
  },
  {
    id: "render",
    target: ".export-submit",
    action: "render",
  },
  {
    id: "ready",
    target: ".export-dialog-header",
  },
] as const;
export type TutorialStepId = (typeof steps)[number]["id"];
export type TutorialAction =
  | "select"
  | "effectMenu"
  | "effectCategory"
  | "dither"
  | "motion"
  | "context"
  | "transition"
  | "pin"
  | "pop"
  | "play"
  | "export"
  | "video"
  | "render";
