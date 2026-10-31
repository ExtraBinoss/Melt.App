import { test, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { SPATIAL_MODEL_CATALOG } from "../../../packages/assets/src/spatial/catalog";
test("every bundled CC0 model matches its pinned bytes and embeds all binary/image dependencies", async () => {
  expect(SPATIAL_MODEL_CATALOG).toHaveLength(16);
  for (const model of SPATIAL_MODEL_CATALOG) {
    const bytes = await readFile(`apps/web/public/${model.file}`);
    expect(bytes.length).toBe(model.byteLength);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(model.sha256);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    expect(view.getUint32(0, true)).toBe(0x46546c67);
    expect(view.getUint32(8, true)).toBe(bytes.length);
    const size = view.getUint32(12, true),
      doc = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + size)));
    expect(doc.buffers.every((buffer: { uri?: string }) => !buffer.uri)).toBe(true);
    expect(
      (doc.images ?? []).every(
        (image: { uri?: string; bufferView?: number }) =>
          !image.uri && Number.isInteger(image.bufferView),
      ),
    ).toBe(true);
    expect(model.license).toBe("CC0-1.0");
    expect(model.author).toBe("Kenney");
  }
  for (const pack of ["prototype", "nature"]) {
    const license = await readFile(
      `apps/web/public/spatial/models/Kenney-${pack}-LICENSE.txt`,
      "utf8",
    );
    expect(license).toContain("CC0");
    expect(license).toContain("commercial");
  }
});
