import { expect, test } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { installReadbackProbe } from "./support/readback-probe";

test("template hover keeps continuous animation and ordered video PTS through a native loop", async ({
  page,
}) => {
  await installReadbackProbe(page);
  // Other worktrees can emit HMR updates on the shared dev server. Freeze this run's modules.
  await page.routeWebSocket("**", (socket) => {
    const server = socket.connectToServer();
    server.onMessage((message) => {
      if (typeof message === "string" && message.includes('"type":"connected"'))
        socket.send(message);
    });
  });
  await page.goto("/dashboard");
  const card = page.getByRole("button", { name: "Preview Bloom Windows", exact: true });
  await card.waitFor();
  await page.evaluate(() => {
    const probe = { frames: [] as { name: string; at: number; detail: Record<string, unknown> }[] };
    Object.assign(window, { templatePlaybackProbe: probe });
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (!entry.name.startsWith("Melt frame:") || probe.frames.length >= 10000) continue;
        probe.frames.push({
          name: entry.name,
          at: entry.startTime,
          detail: (entry as PerformanceMark).detail,
        });
      }
    }).observe({ type: "mark" });
  });
  await card.hover();
  await expect(card.locator("[data-preview-status]")).toHaveAttribute(
    "data-preview-status",
    "playing",
  );
  await page.waitForFunction(
    () => {
      const probe = (
        window as unknown as {
          templatePlaybackProbe: { frames: { name: string; detail: { action?: string } }[] };
        }
      ).templatePlaybackProbe;
      return probe.frames.some(
        (frame) => frame.name === "Melt frame: video-cursor" && frame.detail.action === "restarted",
      );
    },
    undefined,
    { timeout: 20000 },
  );
  const result = await page.evaluate(() => ({
    ...(
      window as unknown as {
        templatePlaybackProbe: {
          frames: { name: string; at: number; detail: Record<string, unknown> }[];
        };
      }
    ).templatePlaybackProbe,
    reads: window.__musartVideoReadbacks,
    agent: navigator.userAgent,
    width: document
      .querySelector(".motion-template-preview-canvas > canvas")
      ?.getAttribute("width"),
  }));
  type Time = { value: number; rate: number };
  const seconds = (value: unknown) => {
    const t = value as Time;
    return t.value / t.rate;
  };
  const videos = result.frames.filter((frame) => frame.name === "Melt frame: video");
  expect(videos.length).toBeGreaterThan(30);
  let previous = -1,
    loops = 0;
  for (const { detail } of videos) {
    expect(detail.action).not.toBe("gap");
    const pts = seconds(detail.pts),
      requested = seconds(detail.sourceTime);
    expect(pts).toBeLessThanOrEqual(requested + 0.000001);
    expect(requested - pts).toBeLessThan(1 / 30 + 0.000001);
    if (pts < previous) {
      expect(requested).toBeLessThan(0.1);
      loops++;
    }
    previous = pts;
  }
  expect(loops).toBe(1);
  const cursors = result.frames.filter((frame) => frame.name === "Melt frame: video-cursor");
  expect(cursors.map((frame) => frame.detail.action)).toEqual(["opened", "restarted"]);
  expect(Number(result.width)).toBeLessThanOrEqual(480);
  expect(result.reads).toMatchObject({ gpu: 0, webgl: 0, canvas: 0 });
  const submitted = result.frames.filter((frame) => frame.name === "Melt frame: preview-submit");
  const intervals = submitted
    .slice(1)
    .map((frame, index) => frame.at - submitted[index]!.at)
    .sort((a, b) => a - b);
  await mkdir("artifacts/template-video-playback", { recursive: true });
  await writeFile(
    "artifacts/template-video-playback/native.json",
    JSON.stringify(
      {
        ...result,
        diagnosticSubmissionIntervals: {
          p50: intervals[Math.floor(intervals.length * 0.5)],
          p95: intervals[Math.floor(intervals.length * 0.95)],
        },
      },
      null,
      2,
    ),
  );
  await page.mouse.move(1500, 20);
  await expect(card.locator("canvas")).toHaveCount(0);
});
