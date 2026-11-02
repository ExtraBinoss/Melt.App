export const copy = {
  invite: "Do you want to start a quick tutorial?",
  detail:
    "Make a small composition with Melt, from your first effect to a video export. A separate practice project will open.",
  yes: "Yes, start tutorial",
  no: "No, thanks",
  next: "Next",
  previous: "Previous",
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
    target: '.canvas-artboard-editor[data-active="true"]',
  },
  {
    title: "Your tools",
    text: "Use the toolbar to select, move, draw and add content. You can also pan with your trackpad and zoom around the pointer with {zoom}.",
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
    title: "Open the effect menu",
    text: "Click {add} at the top of Layers. The guide will follow you into the effect menu.",
    target: ".layer-create-actions",
    action: "effectMenu",
  },
  {
    title: "Add an effect",
    text: "Click {effects} in this menu to open the effect library.",
    target: '[data-effect-menu-category="effect"]',
    action: "effectCategory",
  },
  {
    title: "Try Dither",
    text: "The search is ready. Click {dither} to turn the image into a pattern of dots.",
    target: '[data-effect-catalog-item="dither"]',
    action: "dither",
  },
  {
    title: "Back to your canvas",
    text: "Dither is applied. We have zoomed out and recentered the canvas so you can see the whole composition.",
    target: '.canvas-artboard-editor[data-active="true"]',
  },
  {
    title: "Static and Motion",
    text: "{static} is for still compositions. {motion} adds animation and video playback. The switch lives below your artboard.",
    target: ".motion-mode",
  },
  {
    title: "Make it move",
    text: "We have zoomed in on the switch. Click {motion} to enable animation. We will look at the timeline after adding a transition.",
    target: '.motion-mode [data-segmented-value="motion"]',
    action: "motion",
  },
  {
    title: "Right-click your image",
    text: "The canvas is centered again. Use {rightClick} on the middle image, Lake, to open its actions.",
    target: '.canvas-selection[data-layer-kind="image"]',
    action: "context",
  },
  {
    title: "Add a transition",
    text: "Choose {animation} in this context menu to open the animation library.",
    target: '[data-tutorial="add-transition"]',
    action: "transition",
  },
  {
    title: "Add a pop",
    text: "Click {pop} in the Scale category to give the image a short pop-in entrance.",
    target: '[data-preset-id="scale-pop"]',
    action: "pop",
  },
  {
    title: "Pin the timeline",
    text: "Click {pin} to keep the timeline open. You can resize it; the guide will follow the controls.",
    target: '[data-tutorial="timeline-pin"]',
    action: "pin",
  },
  {
    title: "Your timeline",
    text: "Each row represents a layer. The clips show when it appears, and the Pop clip is its animation. Drag the playhead to inspect a moment; the controls on the left set playback and duration.",
    target: '.motion-timeline-dock[data-motion-pinned="true"]',
  },
  {
    title: "Play",
    text: "Press {play} in the timeline to preview your animation.",
    target: ".motion-transport button",
    action: "play",
  },
  {
    title: "Export",
    text: "Open {export} at the top right. We will export the motion as a video.",
    target: "[data-inspector-export-trigger]",
    action: "export",
  },
  {
    title: "The export window",
    text: "Choose your artboard and output on the left. Preview the result on the right. Resolution and format control the file you download.",
    target: ".export-workspace",
  },
  {
    title: "Motion video",
    text: "Choose {video} in the export window. Keep the default video settings.",
    target: '.export-dialog [data-segmented-value="motion"]',
    action: "video",
  },
  {
    title: "Save your video",
    text: "Click {exportVideo}. Melt will render the actual animation and download it. The render and download continue independently.",
    target: ".export-submit",
    action: "render",
  },
  {
    title: "You're ready",
    text: "You've completed the tutorial. Melt handles the video render and download in the background; you can keep working.",
    target: ".export-dialog-header",
  },
] as const;
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
