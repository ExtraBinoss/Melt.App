import { BoxGeometry, SphereGeometry, type BufferGeometry } from "three";

/** Original procedural Cornell study: no downloaded model or baked movie. */
export function cornellRoomGlb(): Uint8Array {
  const chunks: Uint8Array[] = [];
  const views: { buffer: number; byteOffset: number; byteLength: number; target: number }[] = [];
  const accessors: object[] = [];
  const meshes: object[] = [];
  const nodes: object[] = [];
  let offset = 0;
  function attribute(array: Float32Array | Uint32Array, itemSize: number, position = false) {
    const raw = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
    const bytes = new Uint8Array(Math.ceil(raw.byteLength / 4) * 4);
    bytes.set(raw);
    const view = views.length;
    views.push({
      buffer: 0,
      byteOffset: offset,
      byteLength: raw.byteLength,
      target: itemSize === 1 ? 34963 : 34962,
    });
    chunks.push(bytes);
    offset += bytes.length;
    const bounds = position
      ? [0, 1, 2].map((axis) => {
          let min = Infinity,
            max = -Infinity;
          for (let i = axis; i < array.length; i += 3) {
            min = Math.min(min, array[i]!);
            max = Math.max(max, array[i]!);
          }
          return [min, max];
        })
      : null;
    accessors.push({
      bufferView: view,
      componentType: array instanceof Uint32Array ? 5125 : 5126,
      count: array.length / itemSize,
      type: itemSize === 1 ? "SCALAR" : "VEC3",
      ...(bounds ? { min: bounds.map((b) => b[0]), max: bounds.map((b) => b[1]) } : {}),
    });
    return accessors.length - 1;
  }
  function mesh(
    name: string,
    geometry: BufferGeometry,
    material: number,
    translation: number[],
    rotation?: number[],
  ) {
    try {
      const position = attribute(
        new Float32Array(geometry.getAttribute("position").array),
        3,
        true,
      );
      const normal = attribute(new Float32Array(geometry.getAttribute("normal").array), 3);
      const indices = geometry.index
        ? attribute(new Uint32Array(geometry.index.array), 1)
        : undefined;
      meshes.push({
        name,
        primitives: [
          {
            attributes: { POSITION: position, NORMAL: normal },
            material,
            ...(indices === undefined ? {} : { indices }),
          },
        ],
      });
      nodes.push({ name, mesh: meshes.length - 1, translation, ...(rotation ? { rotation } : {}) });
    } finally {
      geometry.dispose();
    }
  }
  mesh("Left / vermilion", new BoxGeometry(0.06, 2, 2), 1, [-1.03, 0, 0]);
  mesh("Right / green", new BoxGeometry(0.06, 2, 2), 2, [1.03, 0, 0]);
  mesh("Floor", new BoxGeometry(2, 0.06, 2), 0, [0, -1.03, 0]);
  mesh("Ceiling", new BoxGeometry(2, 0.06, 2), 0, [0, 1.03, 0]);
  mesh("Back", new BoxGeometry(2, 2, 0.06), 0, [0, 0, -1.03]);
  mesh("Ceiling softbox", new BoxGeometry(0.72, 0.015, 0.6), 3, [0, 0.985, -0.12]);
  const theta = -0.23;
  mesh(
    "Tall block",
    new BoxGeometry(0.58, 1.22, 0.6),
    0,
    [-0.44, -0.39, -0.14],
    [0, Math.sin(theta / 2), 0, Math.cos(theta / 2)],
  );
  mesh("Silver sphere", new SphereGeometry(0.38, 48, 32), 4, [0.43, -0.62, 0.3]);
  const json = {
    asset: { version: "2.0", generator: "Melt / original procedural Cornell study" },
    scene: 0,
    scenes: [{ nodes: nodes.map((_, i) => i) }],
    nodes,
    meshes,
    accessors,
    bufferViews: views,
    buffers: [{ byteLength: offset }],
    materials: [
      {
        name: "Chalk",
        pbrMetallicRoughness: {
          baseColorFactor: [0.63, 0.64, 0.62, 1],
          roughnessFactor: 0.82,
          metallicFactor: 0,
        },
      },
      {
        name: "Vermilion",
        pbrMetallicRoughness: {
          baseColorFactor: [0.54, 0.022, 0.029, 1],
          roughnessFactor: 0.9,
          metallicFactor: 0,
        },
      },
      {
        name: "Green",
        pbrMetallicRoughness: {
          baseColorFactor: [0.035, 0.4, 0.095, 1],
          roughnessFactor: 0.9,
          metallicFactor: 0,
        },
      },
      {
        name: "Softbox",
        emissiveFactor: [1, 1, 1],
        pbrMetallicRoughness: {
          baseColorFactor: [1, 1, 1, 1],
          roughnessFactor: 0.8,
          metallicFactor: 0,
        },
      },
      {
        name: "Brushed silver",
        pbrMetallicRoughness: {
          baseColorFactor: [0.74, 0.77, 0.7, 1],
          roughnessFactor: 0.23,
          metallicFactor: 0.82,
        },
      },
    ],
  };
  const encoded = new TextEncoder().encode(JSON.stringify(json));
  const padded = Math.ceil(encoded.length / 4) * 4;
  const bytes = new Uint8Array(12 + 8 + padded + 8 + offset);
  const header = new DataView(bytes.buffer);
  header.setUint32(0, 0x46546c67, true);
  header.setUint32(4, 2, true);
  header.setUint32(8, bytes.length, true);
  header.setUint32(12, padded, true);
  header.setUint32(16, 0x4e4f534a, true);
  bytes.fill(32, 20, 20 + padded);
  bytes.set(encoded, 20);
  header.setUint32(20 + padded, offset, true);
  header.setUint32(24 + padded, 0x004e4942, true);
  let at = 28 + padded;
  for (const chunk of chunks) {
    bytes.set(chunk, at);
    at += chunk.length;
  }
  return bytes;
}
