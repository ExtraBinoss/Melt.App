import {
  createEffect,
  createSpatialLayer,
  createSpatialScene,
  spatialMaterial,
  planMotionInitialization,
  type Asset,
  type Layer,
} from "@musart/core";
import { TemplateAuthor, seconds } from "../author";

export const ANGEL_WINDOWS_DURATION = 12.8;
export const ANGEL_WINDOWS_SIZE = { width: 1080, height: 1920 } as const;
const BLUE = "#1515ff";
const WIDTH = 360,
  HEIGHT = 320;
const ROLES = [
  { id: "real", name: "angel.real", ink: "#f4f4ff" },
  { id: "wire", name: "mesh.obj", ink: "#1515ff" },
  { id: "xray", name: "xray.exe", ink: "#f2f4ff" },
] as const;

function frameArtwork(name: string, code: number, color: string): Asset {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}"><rect x="1" y="1" width="358" height="318" fill="none" stroke="${color}" stroke-width="2"/><path d="M0 0H360V27H0Z" fill="#efefff"/><circle cx="15" cy="13" r="5" fill="#1515ff"/><circle cx="33" cy="13" r="5" fill="#bcbcf5"/><circle cx="51" cy="13" r="5" fill="#d7d7f6"/><text x="74" y="18" fill="#12126e" font-family="monospace" font-size="12" font-weight="700">${name} — #${code}</text><g fill="none" stroke="${color}" stroke-width="2"><path d="M12 53V39H27M333 39H348V53M12 285V300H27M333 300H348V285"/></g><text x="12" y="311" fill="${color}" font-family="monospace" font-size="9">${name.split(".")[0]!.toUpperCase()} / LIVE</text></svg>`;
  return {
    id: `angel-${name}-frame`,
    name: `${name} / editable SVG chrome`,
    kind: "image",
    mime: "image/svg+xml",
    width: WIDTH,
    height: HEIGHT,
    dataUrl: `data:image/svg+xml,${encodeURIComponent(svg)}`,
  };
}

/** Every copy shares one original model; source motion and windows use exact authored time. */
export function createAngelWindows(model: Asset) {
  const { width, height } = ANGEL_WINDOWS_SIZE;
  const a = new TemplateAuthor("angel-windows", "Angel.exe", width, height);
  const scene = createSpatialScene();
  scene.camera = { projection: "orthographic", yaw: 12, pitch: 4, distance: 3.8, fov: 45 };
  scene.shadows = false;
  scene.environment.intensity = 0.14;
  scene.lights = [
    { ...scene.lights[0]!, id: "angel-key-light", intensity: 1.2, castShadow: false },
  ];
  a.commit([{ type: "updatePage", patch: { background: BLUE, spatial: scene } }]);
  const frames = ROLES.map((role, i) =>
    frameArtwork(role.name, 7292 + i, role.id === "real" ? "#ffffff" : role.ink),
  );
  const atlas = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT * 3}" viewBox="0 0 ${WIDTH} ${HEIGHT * 3}">${frames
    .map((frame, i) => {
      const svg = decodeURIComponent(
        (frame as { dataUrl: string }).dataUrl.split(",").slice(1).join(","),
      );
      return `<g transform="translate(0 ${i * HEIGHT})">${svg.slice(svg.indexOf(">") + 1, svg.lastIndexOf("</svg>"))}</g>`;
    })
    .join("")}</svg>`;
  const frame: Asset = {
    id: "angel-frame-atlas",
    kind: "image",
    name: "Window chrome / editable SVG atlas",
    mime: "image/svg+xml",
    width: WIDTH,
    height: HEIGHT * 3,
    dataUrl: `data:image/svg+xml,${encodeURIComponent(atlas)}`,
  };
  const id = "angel-desktop";
  const layers: Layer[] = [
    a.layer("group", id, "Desktop / live source and window ribbons", {
      width,
      height,
      effects: [
        createEffect("window-trails", {
          id: "angel-windows-fx",
          scale: 12,
          inputs: { frame: frame.id },
          settings: {
            backgroundShade: 0.25,
            stars: 0.2,
            showSource: true,
            asciiBackground: true,
            alternateTreatments: true,
            count: 26,
            ribbons: 3,
            entranceDelay: 1.8,
            frameRows: 3,
            delay: 0.045,
            speed: 0.105,
            phase: 0,
            centerX: 0.5,
            centerY: 0.47,
            radiusX: 0.31,
            radiusY: 0.25,
            width: WIDTH,
            height: HEIGHT,
            titleHeight: 27,
            border: 2,
            fade: 0.14,
            path: "figure-eight",
            treatment: "original",
            paper: BLUE,
            ink: "#dedfff",
            chrome: "#efefff",
            sampling: "screen",
          },
        }),
      ],
    }),
    a.layer("rectangle", "angel-model", "Angel / single shared 3D original", {
      parentId: id,
      assetId: model.id,
      width,
      height,
      fill: "#d6d6df",
      spatial: {
        ...createSpatialLayer("glb"),
        y: 0.18,
        scaleX: 0.9,
        scaleY: 0.9,
        scaleZ: 0.9,
        castShadow: false,
        receiveShadow: false,
        useModelMaterials: false,
        material: { ...spatialMaterial("clay").settings },
      },
    }),
    a.layer("text", "angel-credit", "Model attribution / editable", {
      x: 30,
      y: height - 36,
      width: width - 60,
      height: 18,
      fontSize: 12,
      text: "Engel · noe-3d.at / M. K. Turkcan · CC BY 4.0",
      fill: "#a9adff",
    }),
    a.layer("rectangle", "angel-menu-paper", "Desktop / menu surface", {
      width,
      height: 32,
      fill: "#e4e4ff",
    }),
    a.layer("text", "angel-menu", "Desktop / menu bar", {
      x: 0,
      y: 0,
      width,
      height: 32,
      fontFamily: "Inter",
      fontSize: 14,
      fontWeight: 600,
      text: "   ◆    hardangel.exe       File       View       Filter       Window",
      fill: "#1515ff",
    }),
  ];
  a.commit([{ type: "addLayers", layers, assets: [model, frame] }]);
  const plan = planMotionInitialization(a.engine.getSnapshot(), seconds(ANGEL_WINDOWS_DURATION), {
    numerator: 30,
    denominator: 1,
  });
  a.commit([{ type: "setCompositionMode", mode: "motion", plan, confirmed: true }]);
  for (const layer of layers.filter((layer) => layer.spatial?.source === "glb")) {
    a.commit(
      a.layerKeys(layer.id, "spatial.rotationY", [
        [0, -35],
        [ANGEL_WINDOWS_DURATION, 685, { type: "linear" }],
      ]),
    );
    a.commit(
      a.layerKeys(layer.id, "spatial.rotationZ", [
        [0, -17],
        [3.2, 18, { type: "cubicBezier", x1: 0.42, y1: 0, x2: 0.58, y2: 1 }],
        [6.4, -17, { type: "cubicBezier", x1: 0.42, y1: 0, x2: 0.58, y2: 1 }],
        [9.6, 18, { type: "cubicBezier", x1: 0.42, y1: 0, x2: 0.58, y2: 1 }],
        [12.8, -17, { type: "cubicBezier", x1: 0.42, y1: 0, x2: 0.58, y2: 1 }],
      ]),
    );
  }
  a.commit(
    a.keys({ kind: "effect", layerId: id, effectId: "angel-windows-fx", property: "time" }, [
      [0, 0],
      [ANGEL_WINDOWS_DURATION, ANGEL_WINDOWS_DURATION, { type: "linear" }],
    ]),
  );
  return a.finish();
}
