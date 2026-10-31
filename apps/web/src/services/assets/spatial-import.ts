import {
  createLayer,
  createSpatialLayer,
  createSpatialScene,
  type EnginePort,
  type SceneAsset,
  type SessionSnapshot,
  type SpatialSource,
} from "@musart/core";
import { readDataUrl } from "./imports";
import { canvasNativeRenderer } from "../../canvas/render/plane-resources";
function assertCurrent(engine: EnginePort, origin: SessionSnapshot, signal?: AbortSignal) {
  signal?.throwIfAborted();
  const current = engine.getSnapshot();
  if (
    current.project !== origin.project ||
    current.pageId !== origin.pageId ||
    current.revision !== origin.revision
  )
    throw new DOMException("The composition changed during import", "AbortError");
}
function freshScene() {
  const scene = createSpatialScene();
  return { ...scene, lights: scene.lights.map((light) => ({ ...light, id: crypto.randomUUID() })) };
}
function assertSize(file: File) {
  if (!file.size || file.size > 64 * 1024 * 1024) throw Error("3D original exceeds 64 MiB");
}
export function insertSpatialObject(
  engine: EnginePort,
  source: SpatialSource | "text",
  name: string,
) {
  const snapshot = engine.getSnapshot(),
    page = snapshot.project.pages.find((item) => item.id === snapshot.pageId)!;
  const size = Math.min(page.width, page.height) * 0.55;
  const layer = createLayer(source === "text" ? "text" : "rectangle", {
    id: crypto.randomUUID(),
    name,
    x: (page.width - size) / 2,
    y: (page.height - size) / 2,
    width: size,
    height: size,
    fill: "#8B5CF6",
    ...(source === "text" ? { text: "Melt", fontSize: size * 0.3 } : {}),
    spatial: createSpatialLayer(source === "text" ? "extrude" : source),
  });
  engine.transaction([
    { type: "addLayers", layers: [layer] },
    ...(!page.spatial ? [{ type: "updatePage" as const, patch: { spatial: freshScene() } }] : []),
  ]);
  engine.select([layer.id]);
  return layer;
}
export async function importSpatialModel(engine: EnginePort, file: File, signal?: AbortSignal) {
  assertSize(file);
  const origin = engine.getSnapshot(),
    page = origin.project.pages.find((item) => item.id === origin.pageId)!;
  const { loadGlb, glbMetadata, disposeModels } = await import("@musart/render/spatial");
  assertCurrent(engine, origin, signal);
  const canvas = document.querySelector<HTMLCanvasElement>(".editor-canvas canvas[data-backend]");
  const gltf = await loadGlb(
    await file.arrayBuffer(),
    canvas ? (canvasNativeRenderer(canvas) ?? undefined) : undefined,
  );
  let metadata: ReturnType<typeof glbMetadata>;
  try {
    metadata = glbMetadata(gltf.scene, gltf.animations);
  } finally {
    disposeModels(gltf.scenes);
  }
  if (metadata.animations.length > 64) throw Error("Model exceeds 64 clips");
  const asset: SceneAsset = {
    kind: "model3d",
    id: crypto.randomUUID(),
    name: file.name,
    mime: "model/gltf-binary",
    width: 1,
    height: 1,
    byteLength: file.size,
    dataUrl: await readDataUrl(new Blob([file], { type: "model/gltf-binary" })),
    clips: metadata.animations,
  };
  assertCurrent(engine, origin, signal);
  const size = Math.min(page.width, page.height) * 0.55;
  const layer = createLayer("rectangle", {
    id: crypto.randomUUID(),
    name: file.name.replace(/\.glb$/i, ""),
    assetId: asset.id,
    width: size,
    height: size,
    x: (page.width - size) / 2,
    y: (page.height - size) / 2,
    spatial: createSpatialLayer("glb"),
  });
  engine.transaction([
    { type: "addLayers", layers: [layer], assets: [asset] },
    ...(!page.spatial ? [{ type: "updatePage" as const, patch: { spatial: freshScene() } }] : []),
  ]);
  engine.select([layer.id]);
}
export async function importSpatialEnvironment(
  engine: EnginePort,
  file: File,
  signal?: AbortSignal,
) {
  assertSize(file);
  const origin = engine.getSnapshot(),
    page = origin.project.pages.find((item) => item.id === origin.pageId)!;
  const extension = file.name.split(".").pop()?.toLowerCase();
  const mime =
    extension === "hdr" ? "image/vnd.radiance" : extension === "exr" ? "image/x-exr" : file.type;
  if (
    !["image/vnd.radiance", "image/x-exr", "image/png", "image/jpeg", "image/webp"].includes(mime)
  )
    throw Error("Unsupported environment original");
  const dataUrl = await readDataUrl(new Blob([file], { type: mime }));
  const { decodeEnvironment, disposeEnvironmentInput } = await import("@musart/render/spatial");
  const decoded = await decodeEnvironment(dataUrl, mime, signal);
  const { width, height } = decoded;
  disposeEnvironmentInput(decoded.texture);
  assertCurrent(engine, origin, signal);
  const asset: SceneAsset = {
    kind: "environment",
    id: crypto.randomUUID(),
    name: file.name,
    mime,
    width,
    height,
    byteLength: file.size,
    dataUrl,
  };
  const settings = page.spatial ?? createSpatialScene();
  engine.transaction([
    { type: "addLayers", layers: [], assets: [asset] },
    {
      type: "updatePage",
      patch: {
        spatial: { ...settings, environment: { ...settings.environment, assetId: asset.id } },
      },
    },
  ]);
  engine.select([...origin.selection]);
}
