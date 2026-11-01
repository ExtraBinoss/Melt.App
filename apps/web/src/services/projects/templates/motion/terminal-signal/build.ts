import {
  createEffect,
  planMotionInitialization,
  type Layer,
  type MotionAnimationPreset,
} from "@musart/core";
import { TemplateAuthor, seconds } from "../author";

export const TERMINAL_SIGNAL_DURATION = 16;
export const TERMINAL_SIGNAL_SIZE = { width: 1080, height: 1920 } as const;
export const TERMINAL_SIGNAL_LINES = [
  "> MAKE IT MOVE",
  "> TYPE YOUR OWN STORY",
  "> ONE SIMPLE SIGNAL",
  "> SHAPES INTO MOTION",
  "> TAKE UP THE SCREEN",
  "> KEEP THE ENERGY",
  "> MAKE IT YOURS",
  "> PRESS PLAY AGAIN",
] as const;
const GREEN = "#20FF08";
// Roboto Mono's bundled 1229/2048 em advance keeps the shader's cells aligned to editable glyphs.
const ADVANCE = 1229 / 2048;
const smooth = { type: "cubicBezier", x1: 0.42, y1: 0, x2: 0.58, y2: 1 } as const;

function typing(columns: number, rows: number, cursor: "line" | "block"): MotionAnimationPreset {
  const { id: _id, ...effect } = createEffect("terminal", {
    settings: { progress: 1, columns, rows, cursor, cursorColor: GREEN, blinkRate: 0 },
  });
  return {
    version: 1,
    id: `terminal-type-${columns}-${rows}`,
    name: "Terminal · Type",
    category: "reveal",
    duration: 1200,
    effects: [effect],
    channels: [
      {
        target: { kind: "effectSetting", slot: 0, property: "progress" },
        operation: "replace",
        points: [
          { at: 0, value: 0 },
          { at: 1, value: 1, easing: { type: "linear" } },
        ],
      },
    ],
  };
}

/** One editable multiline source, four two-point typing actions and native GPU screen treatment. */
export function createTerminalSignal() {
  const a = new TemplateAuthor("terminal-signal", "Terminal Signal", 1080, 1920);
  const screen = "terminal-screen",
    transcript = "terminal-transcript",
    finale = "terminal-finale";
  const crt = createEffect("crt", {
    id: "terminal-screen-crt",
    scale: 2,
    settings: {
      curvatureX: 0.12,
      curvatureY: 0.17,
      zoom: 1.01,
      maskStrength: 0.025,
      scanlineStrength: 0.12,
      scanlinePitch: 3.5,
      scanlineWidth: 0.8,
      convergence: 0.2,
      glow: 0.45,
      glowRadius: 5,
      brightness: 1.12,
      contrast: 1,
      saturation: 1,
      vignette: 0.18,
      roundness: 0.035,
      noise: 0.007,
      jitter: 0.15,
      flicker: 0.012,
      flickerRate: 12,
      rollingBar: 0.025,
      rollingSpeed: 0.17,
    },
  });
  const layers: Layer[] = [
    a.layer("group", screen, "Screen / CRT, scanlines and curved glass", {
      width: 1080,
      height: 1920,
      effects: [crt],
    }),
    a.layer("rectangle", "terminal-paper", "Screen / dark phosphor", {
      parentId: screen,
      width: 1080,
      height: 1920,
      fill: "#030703",
    }),
    a.layer("group", "terminal-grid", "Background / editable grid", {
      parentId: screen,
      width: 1080,
      height: 1920,
    }),
  ];
  for (let x = 0; x < 1080; x += 60)
    layers.push(
      a.layer("rectangle", `terminal-grid-x-${x}`, "Grid / vertical", {
        parentId: "terminal-grid",
        x,
        width: 1.5,
        height: 1920,
        fill: "#133A0C",
        opacity: 0.25,
      }),
    );
  for (let y = 0; y < 1920; y += 60)
    layers.push(
      a.layer("rectangle", `terminal-grid-y-${y}`, "Grid / horizontal", {
        parentId: "terminal-grid",
        y,
        width: 1080,
        height: 1.5,
        fill: "#133A0C",
        opacity: 0.25,
      }),
    );
  layers.push(
    a.layer("rectangle", "terminal-frame", "Screen / editable frame", {
      parentId: screen,
      x: 42,
      y: 80,
      width: 996,
      height: 1760,
      fill: "#00000000",
      stroke: "#27561A",
      strokeWidth: 2,
      radius: 42,
      opacity: 0.6,
    }),
    a.layer("group", transcript, "Transcript / shared movement", {
      parentId: screen,
      width: 1080,
      height: 1920,
      rotation: -2.5,
      affine: [1, 0.035, 0, 1],
    }),
    a.layer("text", "terminal-copy", "Edit your message / eight lines", {
      parentId: transcript,
      x: 108,
      y: 600,
      width: 24 * 56 * ADVANCE,
      height: 8 * 84,
      text: TERMINAL_SIGNAL_LINES.map((line) => line.padEnd(24)).join("\n"),
      fontFamily: "Roboto Mono",
      fontSize: 56,
      fontWeight: 700,
      lineHeight: 1.5,
      fill: GREEN,
    }),
    a.layer("group", finale, "Finale / repeated signal", {
      parentId: screen,
      width: 1080,
      height: 1920,
      opacity: 0,
      rotation: -2.5,
      affine: [1, 0.035, 0, 1],
    }),
  );
  for (let index = 0; index < 3; index++)
    layers.push(
      a.layer("text", `terminal-repeat-${index}`, `Edit closing line ${index + 1}`, {
        parentId: finale,
        x: 108,
        y: 530 + index * 320,
        width: 14 * 96 * ADVANCE,
        height: 144,
        text: "> MAKE IT MOVE",
        fontFamily: "Roboto Mono",
        fontSize: 96,
        fontWeight: 700,
        lineHeight: 1.5,
        fill: GREEN,
      }),
    );
  a.commit([
    { type: "updatePage", patch: { background: "#030703" } },
    { type: "addLayers", layers },
  ]);
  const plan = planMotionInitialization(a.engine.getSnapshot(), seconds(TERMINAL_SIGNAL_DURATION), {
    numerator: 60,
    denominator: 1,
  });
  a.commit([{ type: "setCompositionMode", mode: "motion", plan, confirmed: true }]);
  a.commit([
    {
      type: "addMotionAnimation",
      trackId: a.track("terminal-copy"),
      preset: typing(24, 8, "line"),
      start: seconds(0),
      duration: seconds(8.8),
    },
  ]);
  a.commit([
    ...a.layerKeys(transcript, "y", [
      [0, 90],
      [3.5, 15, smooth],
      [8.8, -270, smooth],
      [9.7, -330, smooth],
    ]),
    ...a.layerKeys(transcript, "opacity", [
      [0, 1],
      [9.2, 1],
      [9.7, 0],
    ]),
    ...a.layerKeys(transcript, "rotation", [
      [0, -2.5],
      [5, 1.5, smooth],
      [9.7, -1, smooth],
    ]),
    ...a.layerKeys(finale, "opacity", [
      [0, 0],
      [9.3, 0],
      [9.7, 1],
    ]),
    ...a.layerKeys(finale, "y", [
      [0, 0],
      [9.4, 0],
      [16, -70, smooth],
    ]),
    ...a.layerKeys(finale, "rotation", [
      [0, -2.5],
      [9.4, -2.5],
      [12.5, 2, smooth],
      [16, -1, smooth],
    ]),
    ...a.keys({ kind: "effect", layerId: screen, effectId: crt.id, property: "time" }, [
      [0, 0],
      [16, 16, { type: "linear" }],
    ]),
  ]);
  for (let index = 0; index < 3; index++)
    a.commit([
      {
        type: "addMotionAnimation",
        trackId: a.track(`terminal-repeat-${index}`),
        preset: typing(14, 1, "block"),
        start: seconds(9.5 + index * 0.85),
        duration: seconds(0.8),
      },
    ]);
  return a.finish();
}
