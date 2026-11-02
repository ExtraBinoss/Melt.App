import { segmentPrompt } from "../sam";
import { prepareImage } from "./image";
import type { ModelDownloadEvent } from "../model/contract";
import type { MaskResult } from "../selection";
import type { ObjectCandidate } from "../prompts";

/** Bounded automatic proposals: sixteen decoder passes, one reused image embedding. */
export async function scanObjects(url: string, onProgress?: (event: ModelDownloadEvent) => void) {
  const { width, height } = await prepareImage(url);
  const candidates: (ObjectCandidate & { signature: Uint8Array })[] = [];
  let best: MaskResult | undefined;
  for (let row = 0; row < 4; row++)
    for (let column = 0; column < 4; column++) {
      const x = ((column + 0.5) * width) / 4,
        y = ((row + 0.5) * height) / 4;
      const mask = await segmentPrompt(url, { points: [{ x, y, label: 1 }] }, onProgress);
      const signature = new Uint8Array(64 * 64);
      let area = 0;
      for (let sy = 0; sy < 64; sy++)
        for (let sx = 0; sx < 64; sx++) {
          const index =
            Math.min(height - 1, Math.floor(((sy + 0.5) * height) / 64)) * width +
            Math.min(width - 1, Math.floor(((sx + 0.5) * width) / 64));
          signature[sy * 64 + sx] = mask.data[index * 4 + 3]! > 0 ? 1 : 0;
          area += signature[sy * 64 + sx]!;
        }
      if (mask.score < 0.7 || area < 4 || area > 64 * 64 * 0.9) continue;
      const duplicate = candidates.some((candidate) => {
        let intersection = 0,
          union = 0;
        for (let i = 0; i < signature.length; i++) {
          if (signature[i] && candidate.signature[i]) intersection++;
          if (signature[i] || candidate.signature[i]) union++;
        }
        return union > 0 && intersection / union > 0.85;
      });
      if (duplicate) continue;
      candidates.push({ x, y, score: mask.score, signature });
      if (!best || mask.score > (best.score ?? 0)) best = mask;
    }
  if (!best || !candidates.length)
    throw Error("No distinct object found. Add a foreground point or draw a rectangle.");
  candidates.sort((a, b) => b.score - a.score);
  return { ...best, candidates: candidates.map(({ x, y, score }) => ({ x, y, score })) };
}
