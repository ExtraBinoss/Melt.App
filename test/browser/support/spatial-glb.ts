/** Self-contained animated tetrahedron. No network, decoder extension or external texture. */
export function spatialGlb() {
  const binary = new ArrayBuffer(112);
  new Float32Array(binary, 0, 12).set([-1, -1, 0, 1, -1, 0, 0, 1, 0, 0, 0, 1]);
  new Uint16Array(binary, 48, 12).set([0, 2, 1, 0, 1, 3, 1, 2, 3, 2, 0, 3]);
  new Float32Array(binary, 72, 2).set([0, 1]);
  new Float32Array(binary, 80, 8).set([0, 0, 0, 1, 0, Math.SQRT1_2, 0, Math.SQRT1_2]);
  const json = {
    asset: { version: "2.0", generator: "Melt native regression" },
    buffers: [{ byteLength: 112 }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: 48 },
      { buffer: 0, byteOffset: 48, byteLength: 24 },
      { buffer: 0, byteOffset: 72, byteLength: 8 },
      { buffer: 0, byteOffset: 80, byteLength: 32 },
    ],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: 4,
        type: "VEC3",
        min: [-1, -1, 0],
        max: [1, 1, 1],
      },
      { bufferView: 1, componentType: 5123, count: 12, type: "SCALAR" },
      { bufferView: 2, componentType: 5126, count: 2, type: "SCALAR", min: [0], max: [1] },
      { bufferView: 3, componentType: 5126, count: 2, type: "VEC4" },
    ],
    materials: [
      {
        name: "Blue",
        doubleSided: true,
        pbrMetallicRoughness: {
          baseColorFactor: [0.12, 0.3, 0.9, 1],
          metallicFactor: 0.3,
          roughnessFactor: 0.2,
        },
      },
    ],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0 }] }],
    nodes: [{ name: "Tetrahedron", mesh: 0 }],
    scenes: [{ nodes: [0] }],
    scene: 0,
    animations: [
      {
        name: "Quarter turn",
        samplers: [{ input: 2, output: 3, interpolation: "LINEAR" }],
        channels: [{ sampler: 0, target: { node: 0, path: "rotation" } }],
      },
    ],
  };
  const encoded = new TextEncoder().encode(JSON.stringify(json));
  const jsonLength = Math.ceil(encoded.length / 4) * 4;
  const result = new ArrayBuffer(12 + 8 + jsonLength + 8 + binary.byteLength),
    view = new DataView(result);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, result.byteLength, true);
  view.setUint32(12, jsonLength, true);
  view.setUint32(16, 0x4e4f534a, true);
  new Uint8Array(result, 20, jsonLength).fill(32);
  new Uint8Array(result, 20, encoded.length).set(encoded);
  view.setUint32(20 + jsonLength, binary.byteLength, true);
  view.setUint32(24 + jsonLength, 0x004e4942, true);
  new Uint8Array(result, 28 + jsonLength).set(new Uint8Array(binary));
  return result;
}
/** Small RLE Radiance panorama with values (2, 1, 0.5), including a real HDR exponent. */
export function spatialHdr(width = 1024, height = 512) {
  const header = new TextEncoder().encode(
    `#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y ${height} +X ${width}\n`,
  );
  const row: number[] = [2, 2, width >> 8, width & 255];
  for (const value of [128, 64, 32, 130]) {
    for (let remaining = width; remaining > 0;) {
      const count = Math.min(127, remaining);
      row.push(128 + count, value);
      remaining -= count;
    }
  }
  const result = new Uint8Array(header.length + row.length * height);
  result.set(header);
  for (let y = 0; y < height; y++) result.set(row, header.length + y * row.length);
  return result;
}
