import { beforeEach, expect, it, vi } from "vitest";
const fake = vi.hoisted(() => ({ segment: vi.fn() }));
vi.mock("../../../src/services/selection/sam", () => ({ segmentPrompt: fake.segment }));
vi.mock("../../../src/services/selection/websam/image", () => ({
  prepareImage: async () => ({ width: 8, height: 8 }),
}));
import { scanObjects } from "../../../src/services/selection/websam/scan";
beforeEach(() => {
  fake.segment.mockReset();
});
function mask(offset: number, score: number) {
  const data = new Uint8ClampedArray(8 * 8 * 4);
  for (let y = 0; y < 8; y++)
    for (let x = offset; x < offset + 2; x++) data[(y * 8 + x) * 4 + 3] = 255;
  return { data, width: 8, height: 8, score };
}
it("bounds scanning to 16 prompts, deduplicates objects and returns the best real mask with editable seeds", async () => {
  fake.segment.mockImplementation(async (_url, prompt) =>
    mask(prompt.points[0].x < 4 ? 0 : 5, prompt.points[0].x < 4 ? 0.8 : 0.95),
  );
  const result = await scanObjects("source");
  expect(fake.segment).toHaveBeenCalledTimes(16);
  expect(result.candidates).toEqual([
    { x: 5, y: 1, score: 0.95 },
    { x: 1, y: 1, score: 0.8 },
  ]);
  expect(result.data).toEqual(mask(5, 0.95).data);
});
it("rejects low-confidence proposals and real decoder errors instead of inventing a selection", async () => {
  fake.segment.mockResolvedValue(mask(0, 0.2));
  await expect(scanObjects("source")).rejects.toThrow("No distinct object");
  fake.segment.mockRejectedValueOnce(Error("GPU failed"));
  await expect(scanObjects("source")).rejects.toThrow("GPU failed");
});
