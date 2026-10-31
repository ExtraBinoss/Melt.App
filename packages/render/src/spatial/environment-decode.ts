import { DataUtils, HalfFloatType } from "three";
export interface EnvironmentPixels {
  width: number;
  height: number;
  originalWidth: number;
  originalHeight: number;
  half: boolean;
  data: ArrayBuffer;
}
export function assertEnvironmentDimensions(width: number, height: number) {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 2 ||
    height < 1 ||
    width > 4096 ||
    height > 2048 ||
    width / height < 1.9 ||
    width / height > 2.1
  )
    throw Error("Environment requires a 2:1 panorama up to 4096 × 2048");
}
function preflight(buffer: ArrayBuffer, mime: string) {
  if (!buffer.byteLength || buffer.byteLength > 64 * 1024 * 1024)
    throw Error("Environment exceeds the original size budget");
  const bytes = new Uint8Array(buffer);
  if (mime === "image/vnd.radiance") {
    const header = new TextDecoder().decode(bytes.subarray(0, Math.min(bytes.length, 65536)));
    const dimensions = /\n-Y\s+(\d+)\s+\+X\s+(\d+)/.exec(header);
    if (!dimensions) throw Error("Invalid HDR dimensions");
    assertEnvironmentDimensions(Number(dimensions[2]), Number(dimensions[1]));
    return;
  }
  const view = new DataView(buffer);
  if (bytes.length < 12 || view.getUint32(0, true) !== 20000630) throw Error("Invalid EXR header");
  let cursor = 8;
  const string = () => {
    const start = cursor;
    while (cursor < bytes.length && cursor - start <= 255 && bytes[cursor] !== 0) cursor++;
    if (cursor >= bytes.length || cursor - start > 255) throw Error("Invalid EXR attribute");
    return new TextDecoder().decode(bytes.subarray(start, cursor++));
  };
  for (
    let attributes = 0;
    attributes < 256 && cursor < Math.min(bytes.length, 1024 * 1024);
    attributes++
  ) {
    const name = string();
    if (!name) break;
    const type = string();
    if (cursor + 4 > bytes.length) break;
    const length = view.getUint32(cursor, true);
    cursor += 4;
    if (cursor + length > bytes.length) throw Error("Invalid EXR attribute length");
    if (name === "dataWindow" && type === "box2i" && length === 16) {
      assertEnvironmentDimensions(
        view.getInt32(cursor + 8, true) - view.getInt32(cursor, true) + 1,
        view.getInt32(cursor + 12, true) - view.getInt32(cursor + 4, true) + 1,
      );
      return;
    }
    cursor += length;
  }
  throw Error("Missing EXR dimensions");
}
export function resizeEnvironmentPixels(
  input: Uint16Array | Float32Array,
  width: number,
  height: number,
): EnvironmentPixels {
  assertEnvironmentDimensions(width, height);
  const half = input instanceof Uint16Array,
    channels = input.length / (width * height);
  if (channels !== 4) throw Error("Environment decoder requires RGBA pixels");
  const targetWidth = Math.min(1024, width),
    targetHeight = Math.min(512, height);
  const output = half
    ? new Uint16Array(targetWidth * targetHeight * 4)
    : new Float32Array(targetWidth * targetHeight * 4);
  for (let y = 0; y < targetHeight; y++)
    for (let x = 0; x < targetWidth; x++) {
      const x0 = Math.floor((x * width) / targetWidth),
        x1 = Math.max(x0 + 1, Math.floor(((x + 1) * width) / targetWidth));
      const y0 = Math.floor((y * height) / targetHeight),
        y1 = Math.max(y0 + 1, Math.floor(((y + 1) * height) / targetHeight));
      for (let c = 0; c < 4; c++) {
        let total = 0;
        for (let sy = y0; sy < y1; sy++)
          for (let sx = x0; sx < x1; sx++) {
            const value = input[(sy * width + sx) * 4 + c]!;
            total += half ? DataUtils.fromHalfFloat(value) : value;
          }
        const value = total / ((x1 - x0) * (y1 - y0));
        output[(y * targetWidth + x) * 4 + c] = half ? DataUtils.toHalfFloat(value) : value;
      }
    }
  return {
    width: targetWidth,
    height: targetHeight,
    originalWidth: width,
    originalHeight: height,
    half,
    data: output.buffer,
  };
}
export async function decodeEnvironmentPixels(
  buffer: ArrayBuffer,
  mime: string,
): Promise<EnvironmentPixels> {
  preflight(buffer, mime);
  const loader =
    mime === "image/vnd.radiance"
      ? new (await import("three/addons/loaders/HDRLoader.js")).HDRLoader()
      : new (await import("three/addons/loaders/EXRLoader.js")).EXRLoader();
  const decoded = loader.parse(buffer);
  if (!decoded.data || (decoded.type !== HalfFloatType && !(decoded.data instanceof Float32Array)))
    throw Error("Unsupported environment pixels");
  return resizeEnvironmentPixels(
    decoded.data as Uint16Array | Float32Array,
    decoded.width ?? NaN,
    decoded.height ?? NaN,
  );
}
