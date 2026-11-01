import { expect, test, vi } from "vitest";
import { startVideoPreview } from "../../../../../src/components/projects/templates/motion-preview/video-preview";

test("encoded card playback reports native progress/pause, and release detaches its media source and events", async () => {
  const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  const load = vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
  const host = document.createElement("span"),
    status = vi.fn();
  const owner = startVideoPreview(host, "/card.mp4?v=source", status);
  const video = host.querySelector("video")!;
  expect(video).toMatchObject({ muted: true, playsInline: true, loop: true });
  expect(video.getAttribute("src")).toBe("/card.mp4?v=source");
  expect(play).toHaveBeenCalledOnce();
  expect(status).toHaveBeenLastCalledWith("loading");
  Object.defineProperties(video, {
    duration: { value: 10 },
    readyState: { value: 2 },
    paused: { value: false },
  });
  video.currentTime = 3;
  video.dispatchEvent(new Event("playing"));
  expect(status).toHaveBeenLastCalledWith("playing");
  expect(owner.playback!.read()).toEqual({ duration: 10, ready: true, playing: true });
  expect(owner.playback!.position.read()).toEqual([3]);
  owner.seek!(20);
  expect(video.currentTime).toBe(10);
  video.dispatchEvent(new Event("pause"));
  expect(status).toHaveBeenLastCalledWith("paused");
  await owner.release();
  expect(host.children).toHaveLength(0);
  expect(video.hasAttribute("src")).toBe(false);
  expect(load).toHaveBeenCalledOnce();
  const calls = status.mock.calls.length;
  video.dispatchEvent(new Event("error"));
  video.dispatchEvent(new Event("playing"));
  owner.setPaused!(false);
  await owner.release();
  expect(status).toHaveBeenCalledTimes(calls);
  expect(load).toHaveBeenCalledOnce();
});

test("play rejection is reported, while a released owner's late rejection is ignored", async () => {
  let reject!: (error: Error) => void;
  vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(
    () =>
      new Promise((_resolve, failure) => {
        reject = failure;
      }),
  );
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
  const status = vi.fn(),
    host = document.createElement("span");
  const owner = startVideoPreview(host, "/card.mp4", status);
  const error = Error("Native decode failed");
  reject(error);
  await Promise.resolve();
  expect(status).toHaveBeenLastCalledWith("failed", error);
  owner.setPaused!(false);
  await owner.release();
  const count = status.mock.calls.length;
  reject(Error("Aborted"));
  await Promise.resolve();
  expect(status).toHaveBeenCalledTimes(count);
});

test("reuses the server poster element without replacing it, then restores its source-free idle state", async () => {
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
  const host = document.createElement("span");
  host.innerHTML = '<video data-preview-video poster="/poster.webp" preload="none"></video>';
  const poster = host.firstElementChild!;
  const owner = startVideoPreview(host, "/card.mp4", vi.fn());
  expect(host.children).toHaveLength(1);
  expect(host.firstElementChild).toBe(poster);
  await owner.release();
  expect(host.firstElementChild).toBe(poster);
  expect(poster).toHaveAttribute("poster", "/poster.webp");
  expect(poster).not.toHaveAttribute("src");
});
