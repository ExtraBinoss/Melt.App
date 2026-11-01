import { createHash } from "node:crypto";

export const ANGEL_SOURCE = {
  url: "https://huggingface.co/datasets/mehmetkeremturkcan/valdrada/resolve/main/Content/models/cp33/bethesda/angel.glb",
  page: "https://huggingface.co/datasets/mehmetkeremturkcan/valdrada/blob/main/LICENSE.md",
  author: "noe-3d.at; LOD preparation by M. K. Turkcan",
  license: "CC-BY-4.0",
  licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
} as const;

/** Keep the supplied 18,733-triangle LOD; discard unused LODs, texture and UVs. No remeshing. */
export function prepareAngel(original: Uint8Array): Uint8Array {
  if (original.byteLength < 28) throw Error("Expected GLB 2.0 original");
  const view = new DataView(original.buffer, original.byteOffset, original.byteLength);
  if (
    view.getUint32(0, true) !== 0x46546c67 ||
    view.getUint32(4, true) !== 2 ||
    view.getUint32(8, true) !== original.byteLength ||
    view.getUint32(16, true) !== 0x4e4f534a
  )
    throw Error("Expected GLB 2.0 original");
  const jsonSize = view.getUint32(12, true);
  const metadata = JSON.parse(new TextDecoder().decode(original.subarray(20, 20 + jsonSize)));
  if (metadata.nodes?.[2]?.name !== "LOD2") throw Error("Unexpected angel hierarchy");
  const primitive = metadata.meshes[metadata.nodes[2].mesh]?.primitives?.[0];
  const binStart = 28 + jsonSize;
  if (!primitive || view.getUint32(24 + jsonSize, true) !== 0x004e4942)
    throw Error("Missing angel geometry");
  const chunks: Uint8Array[] = [],
    accessors: object[] = [],
    bufferViews: object[] = [];
  let offset = 0;
  const copy = (index: number) => {
    const accessor = metadata.accessors[index],
      source = metadata.bufferViews[accessor.bufferView];
    const components = accessor.type === "VEC3" ? 3 : 1;
    if (accessor.sparse || accessor.componentType !== (components === 3 ? 5126 : 5125))
      throw Error("Unexpected angel accessor");
    const sourceStride = source.byteStride ?? components * 4;
    const bytesPerComponent = components === 1 ? 2 : 4;
    const data = new Uint8Array(accessor.count * components * bytesPerComponent);
    const output = new DataView(data.buffer);
    for (let i = 0; i < accessor.count; i++) {
      const at = binStart + source.byteOffset + (accessor.byteOffset ?? 0) + i * sourceStride;
      if (components === 1) {
        const value = view.getUint32(at, true);
        if (value >= 65536) throw Error("Angel exceeds 16-bit index range");
        output.setUint16(i * 2, value, true);
      } else data.set(original.subarray(at, at + 12), i * 12);
    }
    const id = accessors.length;
    accessors.push({
      ...accessor,
      bufferView: id,
      byteOffset: 0,
      componentType: components === 1 ? 5123 : 5126,
    });
    bufferViews.push({
      buffer: 0,
      byteOffset: offset,
      byteLength: data.byteLength,
      target: components === 1 ? 34963 : 34962,
    });
    chunks.push(data);
    offset += data.byteLength;
    const padding = (4 - (offset % 4)) % 4;
    if (padding) {
      chunks.push(new Uint8Array(padding));
      offset += padding;
    }
    return id;
  };
  const POSITION = copy(primitive.attributes.POSITION),
    NORMAL = copy(primitive.attributes.NORMAL),
    indices = copy(primitive.indices);
  const document = {
    asset: {
      version: "2.0",
      generator: "Melt Angel.exe template preparation",
      copyright: `${ANGEL_SOURCE.author} · ${ANGEL_SOURCE.license} · ${ANGEL_SOURCE.page}`,
    },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ name: "Engel / LOD2", mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION, NORMAL }, indices, mode: 4 }] }],
    accessors,
    bufferViews,
    buffers: [{ byteLength: offset }],
    extras: { ...ANGEL_SOURCE, sourceSha256: createHash("sha256").update(original).digest("hex") },
  };
  const json = new TextEncoder().encode(JSON.stringify(document)),
    padded = Math.ceil(json.byteLength / 4) * 4;
  const result = new Uint8Array(28 + padded + offset),
    header = new DataView(result.buffer);
  header.setUint32(0, 0x46546c67, true);
  header.setUint32(4, 2, true);
  header.setUint32(8, result.byteLength, true);
  header.setUint32(12, padded, true);
  header.setUint32(16, 0x4e4f534a, true);
  result.fill(32, 20, 20 + padded);
  result.set(json, 20);
  header.setUint32(20 + padded, offset, true);
  header.setUint32(24 + padded, 0x004e4942, true);
  let start = 28 + padded;
  for (const chunk of chunks) {
    result.set(chunk, start);
    start += chunk.byteLength;
  }
  return result;
}
