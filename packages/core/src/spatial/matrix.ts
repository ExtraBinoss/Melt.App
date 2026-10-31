/** Column-major affine/projective transforms, independent of any rendering backend. */
export type SpatialMatrix = readonly number[];
export const SPATIAL_IDENTITY: SpatialMatrix = Object.freeze([
  1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1,
]);
export function multiplySpatial(a: SpatialMatrix, b: SpatialMatrix): number[] {
  const result = Array<number>(16).fill(0);
  for (let c = 0; c < 4; c++)
    for (let r = 0; r < 4; r++)
      for (let k = 0; k < 4; k++) result[c * 4 + r]! += a[k * 4 + r]! * b[c * 4 + k]!;
  return result;
}
export function invertSpatial(a: SpatialMatrix): number[] {
  const rows = Array.from({ length: 4 }, (_, r) =>
    Array.from({ length: 8 }, (_, c) => (c < 4 ? a[c * 4 + r]! : Number(c - 4 === r))),
  );
  for (let c = 0; c < 4; c++) {
    let pivot = c;
    for (let r = c + 1; r < 4; r++)
      if (Math.abs(rows[r]![c]!) > Math.abs(rows[pivot]![c]!)) pivot = r;
    if (Math.abs(rows[pivot]![c]!) < 1e-15) throw new RangeError("Singular spatial transform");
    [rows[c], rows[pivot]] = [rows[pivot]!, rows[c]!];
    const divisor = rows[c]![c]!;
    for (let k = 0; k < 8; k++) rows[c]![k]! /= divisor;
    for (let r = 0; r < 4; r++) {
      if (r === c) continue;
      const factor = rows[r]![c]!;
      for (let k = 0; k < 8; k++) rows[r]![k]! -= factor * rows[c]![k]!;
    }
  }
  return Array.from({ length: 16 }, (_, i) => rows[i % 4]![4 + Math.floor(i / 4)]!);
}
export function spatialTranslation(x: number, y: number, z: number): number[] {
  const result = [...SPATIAL_IDENTITY];
  result[12] = x;
  result[13] = y;
  result[14] = z;
  return result;
}
export function transformSpatial(m: SpatialMatrix, p: readonly number[]): number[] {
  return Array.from(
    { length: 4 },
    (_, r) => m[r]! * p[0]! + m[4 + r]! * p[1]! + m[8 + r]! * p[2]! + m[12 + r]! * (p[3] ?? 1),
  );
}
export function spatialPose(s: import("./model").SpatialLayer): number[] {
  const [x, y, z] = [s.rotationX, s.rotationY, s.rotationZ].map((v) => (v * Math.PI) / 180);
  const a = Math.cos(x!),
    b = Math.sin(x!),
    c = Math.cos(y!),
    d = Math.sin(y!),
    e = Math.cos(z!),
    f = Math.sin(z!);
  // Euler XYZ, matching the native controls and portable property registry.
  return [
    c * e * s.scaleX,
    (a * f + b * e * d) * s.scaleX,
    (b * f - a * e * d) * s.scaleX,
    0,
    -c * f * s.scaleY,
    (a * e - b * f * d) * s.scaleY,
    (b * e + a * f * d) * s.scaleY,
    0,
    d * s.scaleZ,
    -b * c * s.scaleZ,
    a * c * s.scaleZ,
    0,
    s.x,
    s.y,
    s.z,
    1,
  ];
}
