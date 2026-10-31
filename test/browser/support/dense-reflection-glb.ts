/** Genuine indexed sphere: 258,480 nondegenerate triangles, exceeding balanced capture admission. */
export function denseReflectionGlb() {
  const segments = 360,
    rings = 360;
  const vertices = (segments + 1) * (rings + 1);
  const triangles = 2 * segments * (rings - 1);
  const positions = new Float32Array(vertices * 3);
  const normals = new Float32Array(vertices * 3);
  const indices = new Uint32Array(triangles * 3);
  let vertex = 0,
    index = 0;
  for (let y = 0; y <= rings; y++)
    for (let x = 0; x <= segments; x++) {
      const phi = (x / segments) * Math.PI * 2,
        theta = (y / rings) * Math.PI;
      positions[vertex] = -Math.cos(phi) * Math.sin(theta);
      positions[vertex + 1] = Math.cos(theta);
      positions[vertex + 2] = Math.sin(phi) * Math.sin(theta);
      vertex += 3;
    }
  normals.set(positions);
  for (let y = 0; y < rings; y++)
    for (let x = 0; x < segments; x++) {
      const a = y * (segments + 1) + x + 1,
        b = a - 1;
      const c = b + segments + 1,
        d = a + segments + 1;
      if (y !== 0) {
        indices.set([a, b, d], index);
        index += 3;
      }
      if (y !== rings - 1) {
        indices.set([b, c, d], index);
        index += 3;
      }
    }
  const positionBytes = positions.byteLength,
    normalBytes = normals.byteLength;
  const binary = new Uint8Array(positionBytes + normalBytes + indices.byteLength);
  binary.set(new Uint8Array(positions.buffer));
  binary.set(new Uint8Array(normals.buffer), positionBytes);
  binary.set(new Uint8Array(indices.buffer), positionBytes + normalBytes);
  const json = {
    asset: { version: "2.0", generator: "Melt dense reflection regression" },
    buffers: [{ byteLength: binary.byteLength }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: positionBytes },
      { buffer: 0, byteOffset: positionBytes, byteLength: normalBytes },
      { buffer: 0, byteOffset: positionBytes + normalBytes, byteLength: indices.byteLength },
    ],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: vertices,
        type: "VEC3",
        min: [-1, -1, -1],
        max: [1, 1, 1],
      },
      { bufferView: 1, componentType: 5126, count: vertices, type: "VEC3" },
      { bufferView: 2, componentType: 5125, count: indices.length, type: "SCALAR" },
    ],
    materials: [
      {
        pbrMetallicRoughness: {
          baseColorFactor: [0.85, 0.85, 0.85, 1],
          metallicFactor: 1,
          roughnessFactor: 0.2,
        },
      },
    ],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2, material: 0 }] }],
    nodes: [{ name: "Dense sphere", mesh: 0 }],
    scenes: [{ nodes: [0] }],
    scene: 0,
  };
  const encoded = new TextEncoder().encode(JSON.stringify(json));
  const jsonLength = Math.ceil(encoded.length / 4) * 4;
  const data = new ArrayBuffer(28 + jsonLength + binary.byteLength),
    view = new DataView(data);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, data.byteLength, true);
  view.setUint32(12, jsonLength, true);
  view.setUint32(16, 0x4e4f534a, true);
  new Uint8Array(data, 20, jsonLength).fill(32);
  new Uint8Array(data, 20, encoded.length).set(encoded);
  view.setUint32(20 + jsonLength, binary.byteLength, true);
  view.setUint32(24 + jsonLength, 0x004e4942, true);
  new Uint8Array(data, 28 + jsonLength).set(binary);
  return { data, triangles, vertices };
}
