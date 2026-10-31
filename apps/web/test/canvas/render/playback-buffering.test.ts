import { expect, it, vi } from "vitest";
import { CanvasPlaybackBuffering } from "../../../src/canvas/render/playback-buffering";

it("keeps one lease across coalesced frames and releases only on actual presentation", () => {
  const release = vi.fn(),
    hold = vi.fn(() => release);
  const buffering = new CanvasPlaybackBuffering(hold);
  buffering.pending(true);
  buffering.pending(true);
  expect(hold).toHaveBeenCalledTimes(1);
  expect(release).not.toHaveBeenCalled();
  buffering.presented();
  buffering.presented();
  expect(release).toHaveBeenCalledTimes(1);
  buffering.pending(true);
  buffering.pending(false);
  expect(hold).toHaveBeenCalledTimes(2);
  expect(release).toHaveBeenCalledTimes(2);
});
