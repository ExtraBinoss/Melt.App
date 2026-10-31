import { expect, it, vi } from "vitest";
import { VideoPlaybackDiagnostics } from "../../../src/services/performance/video-playback";
const time = (seconds: number) => ({ value: seconds * 1000, rate: 1000 });
function fixture() {
  const log = vi.fn(),
    probe = new VideoPlaybackDiagnostics(log);
  function present(source: number, wall: number, playing = true, decoded = source) {
    probe.consume(
      "Melt frame: video",
      {
        compositionId: "page",
        layerId: "original",
        assetId: "video",
        sourceName: "Rose",
        sourceDuration: time(12),
        time: time(source),
        sourceTime: time(source),
        pts: time(decoded),
      },
      wall,
    );
    probe.consume(
      "Melt frame: display",
      { compositionId: "page", projectId: "project", time: time(source), playing },
      wall,
    );
  }
  return { log, probe, present };
}
it("reports decoded speed and loop wall duration from actually presented frames", () => {
  const d = fixture();
  d.present(0, 0);
  d.present(4, 2000);
  expect(d.log).toHaveBeenLastCalledWith(
    "[Melt video] Presented speed",
    expect.objectContaining({ decodedSpeed: 2, wallSeconds: 2, decodedAdvanceSeconds: 4 }),
  );
  d.present(11.9, 5900);
  d.present(0.1, 6100);
  expect(d.log).toHaveBeenLastCalledWith(
    "[Melt video] Source loop",
    expect.objectContaining({ cycleWallSeconds: 6.1, durationSeconds: 12, decodedSpeed: 1 }),
  );
});
it("distinguishes actual decoded timestamps, seeks, pauses and decoder restarts", () => {
  const d = fixture();
  d.present(0, 0);
  d.present(4, 2000, true, 1);
  expect(d.log).toHaveBeenLastCalledWith(
    "[Melt video] Presented speed",
    expect.objectContaining({ decodedSpeed: 0.5, sourceAdvanceSeconds: 4 }),
  );
  d.present(2, 2100);
  expect(d.log).toHaveBeenLastCalledWith(
    "[Melt video] Backward seek / reverse",
    expect.objectContaining({ decodedSpeed: null }),
  );
  d.present(2, 2200, false);
  d.present(2, 12000);
  expect(d.log).toHaveBeenLastCalledWith("[Melt video] Playback started", expect.anything());
  d.probe.consume(
    "Melt frame: video-cursor",
    { playing: true, action: "restarted", reason: "loop-or-backward-seek" },
    12001,
  );
  expect(d.log).toHaveBeenLastCalledWith(
    "[Melt video] Decoder cursor restarted",
    expect.objectContaining({ wallMs: 12001 }),
  );
});
