import {
  createLayer,
  createLayerGeometryIndex,
  layerTransform,
  multiplyMatrices,
  setLayerTransform,
  type ImageAsset,
  type Command,
  type Composition,
} from "@musart/core";

/** Keep the cropped source at the exact original local/world mapping, including nested shear. */
export function copySelectionCommands(
  page: Composition,
  layerId: string,
  asset: ImageAsset,
  crop: { x: number; y: number; sourceWidth: number; sourceHeight: number },
  name: string,
  maskName: string,
): Command[] {
  const geometry = createLayerGeometryIndex(page),
    original = geometry.get(layerId);
  if (original.kind !== "image" || original.spatial)
    throw Error("Copy a pixel selection from a 2D image.");
  const sx = original.width / crop.sourceWidth,
    sy = original.height / crop.sourceHeight;
  const copy = createLayer("image", {
    id: crypto.randomUUID(),
    name,
    assetId: asset.id,
    parentId: original.parentId,
    width: asset.width * sx,
    height: asset.height * sy,
    rotation: original.rotation,
    scaleX: original.scaleX,
    scaleY: original.scaleY,
    opacity: original.opacity,
    blendMode: original.blendMode,
    ...(original.clipping ? { clipping: { ...original.clipping } } : {}),
    effects: original.effects.map((effect) => ({ ...effect, id: crypto.randomUUID() })),
  });
  const matrix = multiplyMatrices(layerTransform(original), [1, 0, 0, 1, crop.x * sx, crop.y * sy]);
  setLayerTransform(copy, matrix, original.rotation);
  const commands: Command[] = [];
  if (original.mask || original.radius > 0) {
    const clip = createLayer("rectangle", {
      id: crypto.randomUUID(),
      name: maskName,
      width: original.width,
      height: original.height,
      fill: "#ffffff",
      strokeWidth: 0,
      radius: original.radius,
      opacity: 1,
      maskSource: true,
      mask: original.mask ? { ...original.mask } : null,
    });
    setLayerTransform(clip, geometry.worldMatrix(original.id), 0);
    commands.push({ type: "addLayers", layers: [clip] });
    copy.mask = { layerId: clip.id, enabled: true, inverted: false, mode: "luminance" };
  }
  commands.push(
    { type: "addLayers", layers: [copy], assets: [asset] },
    {
      type: "reorderLayer",
      id: copy.id,
      index: page.layers.findIndex((layer) => layer.id === layerId) + 1,
    },
  );
  return commands;
}
