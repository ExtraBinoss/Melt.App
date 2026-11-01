export const copy = {
  invite: "Do you want to start a quick tutorial?",
  detail:
    "Make a small composition with Melt, from your first effect to a video export. A separate practice project will open.",
  yes: "Yes, start tutorial",
  no: "No, thanks",
  next: "Next",
  skip: "Do it for me",
  exit: "Exit tutorial",
  leave: "Leave the tutorial?",
  leaveDetail:
    "Your practice project will stay available. You can replay the tutorial from editor preferences.",
  stay: "Keep going",
  finish: "Finish",
  replay: "Replay onboarding",
  error: "This action failed. Please try again.",
} as const;
export const steps = [
  {
    title: "Your canvas",
    text: "This is your canvas. Add images, videos, text and objects here. We have loaded three images for you.",
    target: ".canvas-area",
  },
  {
    title: "Your tools",
    text: "Use the toolbar to select, move, draw and add content. You can also pan with your trackpad and zoom around the pointer with Ctrl or Cmd + wheel.",
    target: ".toolbar",
  },
  {
    title: "Properties",
    text: "On the right, change the selected object's size, appearance and effects.",
    target: ".inspector-tabs",
  },
  {
    title: "Layers",
    text: "Layers control the stacking order. Select the middle image, Lake, in this list.",
    target: ".layers-panel",
    action: "select",
  },
  {
    title: "Add an effect",
    text: "At the top of Layers, click +, then Effects to open the effect library.",
    target: ".layer-create-actions",
    action: "effectMenu",
  },
  {
    title: "Try dither",
    text: "Choose One-bit dither. It turns your image into a pattern of dots. You can adjust its settings afterwards.",
    target: "[role=menu]",
    action: "dither",
  },
  {
    title: "Make it move",
    text: "Switch the artboard from Static to Motion to reveal the timeline.",
    target: ".motion-mode",
    action: "motion",
  },
  {
    title: "Pin the timeline",
    text: "Pin the timeline so it stays open while you work.",
    target: "[data-motion-pinned]",
    action: "pin",
  },
  {
    title: "Add a pop",
    text: "On the Lake layer, open Add animation, choose Scale, then Pop. This creates a short pop-in animation.",
    target: "[data-motion-pinned]",
    action: "pop",
  },
  {
    title: "Play",
    text: "Press Play in the timeline to preview your animation.",
    target: "[data-motion-pinned]",
    action: "play",
  },
  {
    title: "Export",
    text: "Open Export at the top right. We will export the motion as a video.",
    target: ".export-actions",
    action: "export",
  },
  {
    title: "Motion video",
    text: "Choose Motion video in the export window. Keep the default video settings.",
    target: '.export-dialog [data-segmented-value="motion"]',
    action: "video",
  },
  {
    title: "Save your video",
    text: "Click Export video. Melt will render the actual animation and download it. Keep this window open until it finishes.",
    target: ".export-submit",
    action: "render",
  },
  {
    title: "You're ready",
    text: "Your video is exported. Keep experimenting with this project, or create your own from Projects.",
    target: ".canvas-area",
  },
] as const;
export type TutorialAction =
  | "select"
  | "effectMenu"
  | "dither"
  | "motion"
  | "pin"
  | "pop"
  | "play"
  | "export"
  | "video"
  | "render";
