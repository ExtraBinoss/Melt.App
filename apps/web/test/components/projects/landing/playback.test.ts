import { afterEach, expect, test, vi } from "vitest";
import { installLandingVideos } from "../../../../src/components/projects/landing/media/playback";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
test("admits two visible decoders, bounds retained sources, and releases all media/listeners", () => {
  let intersect!: IntersectionObserverCallback;
  const disconnect = vi.fn();
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(callback: IntersectionObserverCallback) {
        intersect = callback;
      }
      observe() {}
      disconnect = disconnect;
    },
  );
  const host = document.createElement("div");
  host.innerHTML = Array.from(
    { length: 5 },
    (_, i) => `<video data-landing-video data-source="/clip-${i}.webm"></video>`,
  ).join("");
  const videos = [...host.querySelectorAll("video")];
  for (const video of videos) {
    vi.spyOn(video, "play").mockResolvedValue();
    vi.spyOn(video, "pause").mockImplementation(() => {});
    vi.spyOn(video, "load").mockImplementation(() => {});
  }
  const dispose = installLandingVideos(host);
  const visible = (indices: number[]) =>
    intersect(
      videos.map((target, i) => ({
        target,
        boundingClientRect: target.getBoundingClientRect(),
        intersectionRect: target.getBoundingClientRect(),
        rootBounds: null,
        time: performance.now(),
        isIntersecting: indices.includes(i),
        intersectionRatio: indices.includes(i) ? 1 : 0,
      })) as IntersectionObserverEntry[],
      {} as IntersectionObserver,
    );
  expect(videos.every((video) => !video.hasAttribute("src"))).toBe(true);
  visible([0, 1, 2]);
  expect(videos.filter((video) => video.hasAttribute("src"))).toHaveLength(2);
  expect(videos[0]!.play).toHaveBeenCalledOnce();
  visible([2, 3]);
  expect(videos.filter((video) => video.hasAttribute("src"))).toHaveLength(3);
  expect(videos[0]!.hasAttribute("src")).toBe(false);
  visible([4]);
  expect(videos.filter((video) => video.hasAttribute("src"))).toHaveLength(3);
  dispose();
  expect(disconnect).toHaveBeenCalledOnce();
  expect(videos.every((video) => !video.hasAttribute("src"))).toBe(true);
  expect(videos.every((video) => !video.hasAttribute("data-video-ready"))).toBe(true);
});

test("reduced motion keeps genuine posters without requesting videos", () => {
  let intersect!: IntersectionObserverCallback;
  const original = window.matchMedia;
  window.matchMedia = () =>
    Object.create(original(""), { matches: { value: true } }) as MediaQueryList;
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(callback: IntersectionObserverCallback) {
        intersect = callback;
      }
      observe() {}
      disconnect() {}
    },
  );
  const host = document.createElement("div");
  host.innerHTML = '<video data-landing-video data-source="/clip.webm"></video>';
  const video = host.querySelector("video")!;
  const play = vi.spyOn(video, "play");
  const dispose = installLandingVideos(host);
  intersect(
    [
      {
        target: video,
        boundingClientRect: video.getBoundingClientRect(),
        intersectionRect: video.getBoundingClientRect(),
        rootBounds: null,
        time: performance.now(),
        isIntersecting: true,
        intersectionRatio: 1,
      },
    ],
    {} as IntersectionObserver,
  );
  expect(video).not.toHaveAttribute("src");
  expect(play).not.toHaveBeenCalled();
  dispose();
  window.matchMedia = original;
});

function delayedPlayback() {
  vi.useFakeTimers();
  const reduced = Object.assign(new EventTarget(), { matches: false });
  vi.spyOn(window, "matchMedia").mockReturnValue(reduced as MediaQueryList);
  let intersect!: IntersectionObserverCallback;
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(callback: IntersectionObserverCallback) {
        intersect = callback;
      }
      observe() {}
      disconnect() {}
    },
  );
  const host = document.createElement("div");
  host.innerHTML = Array.from(
    { length: 4 },
    (_, i) =>
      `<video data-landing-video data-source="/clip-${i}.webm" ${i === 0 ? 'data-loop-delay-ms="2000"' : "loop"}></video>`,
  ).join("");
  const videos = [...host.querySelectorAll("video")];
  const paused = new Map(videos.map((video) => [video, true]));
  for (const video of videos) {
    Object.defineProperty(video, "paused", { get: () => paused.get(video) });
    vi.spyOn(video, "play").mockImplementation(async () => {
      paused.set(video, false);
    });
    vi.spyOn(video, "pause").mockImplementation(() => {
      paused.set(video, true);
    });
    vi.spyOn(video, "load").mockImplementation(() => {
      video.currentTime = 0;
    });
  }
  const dispose = installLandingVideos(host);
  const visible = (indices: number[], lowPriority?: number) =>
    intersect(
      videos.map((target, i) => ({
        target,
        isIntersecting: indices.includes(i),
        intersectionRatio: indices.includes(i) ? (i === lowPriority ? 0.25 : 1) : 0,
        boundingClientRect: target.getBoundingClientRect(),
        intersectionRect: target.getBoundingClientRect(),
        rootBounds: null,
        time: 0,
      })),
      {} as IntersectionObserver,
    );
  const finish = () => {
    const video = videos[0]!;
    paused.set(video, true);
    video.currentTime = 5;
    video.dataset.videoReady = "true";
    video.dispatchEvent(new Event("ended"));
  };
  return { video: videos[0]!, videos, visible, finish, dispose, reduced };
}

test("holds a delayed clip's final frame for two seconds, including visibility updates", () => {
  const { video, videos, visible, finish, dispose } = delayedPlayback();
  visible([0, 1]);
  finish();
  visible([0, 1]);
  expect(video.currentTime).toBe(5);
  expect(video).toHaveAttribute("data-video-ready", "true");
  expect(videos[1]!.loop).toBe(true);
  vi.advanceTimersByTime(1_999);
  expect(video.play).toHaveBeenCalledTimes(1);
  expect(video.currentTime).toBe(5);
  vi.advanceTimersByTime(1);
  expect(video.currentTime).toBe(0);
  expect(video.play).toHaveBeenCalledTimes(2);
  expect(video).toHaveAttribute("data-video-ready", "true");
  expect(vi.getTimerCount()).toBe(0);
  dispose();
});

test.each(["hidden", "offscreen", "deactivated", "reduced motion"] as const)(
  "cancels the hold while %s and starts a fresh hold on readmission",
  (reason) => {
    const { video, visible, finish, dispose, reduced } = delayedPlayback();
    const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(false);
    visible([0]);
    finish();
    vi.advanceTimersByTime(1_000);
    if (reason === "hidden") {
      hidden.mockReturnValue(true);
      document.dispatchEvent(new Event("visibilitychange"));
    } else if (reason === "reduced motion") {
      reduced.matches = true;
      reduced.dispatchEvent(new Event("change"));
    } else if (reason === "deactivated") visible([0, 1, 2], 0);
    else visible([]);
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(3_000);
    expect(video.play).toHaveBeenCalledTimes(1);
    expect(video.currentTime).toBe(5);
    hidden.mockReturnValue(false);
    reduced.matches = false;
    visible([0]);
    vi.advanceTimersByTime(1_999);
    expect(video.play).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(video.play).toHaveBeenCalledTimes(2);
    expect(video.currentTime).toBe(0);
    dispose();
  },
);

test("eviction and disposal clear delayed replay work without reviving released sources", () => {
  const { video, visible, finish, dispose } = delayedPlayback();
  visible([0]);
  finish();
  visible([1, 2]);
  visible([3]);
  expect(video).not.toHaveAttribute("src");
  vi.advanceTimersByTime(3_000);
  expect(video.play).toHaveBeenCalledTimes(1);
  visible([0]);
  expect(video.play).toHaveBeenCalledTimes(2);
  finish();
  dispose();
  expect(vi.getTimerCount()).toBe(0);
  video.dispatchEvent(new Event("ended"));
  vi.advanceTimersByTime(3_000);
  expect(video).not.toHaveAttribute("src");
  expect(video.play).toHaveBeenCalledTimes(2);
});

test("an obsolete play rejection cannot replace the final decoded frame during the hold", async () => {
  const { video, visible, finish, dispose } = delayedPlayback();
  let reject!: (error: Error) => void;
  vi.mocked(video.play).mockImplementationOnce(
    () =>
      new Promise<void>((_resolve, rejectPlay) => {
        reject = rejectPlay;
      }),
  );
  visible([0]);
  finish();
  reject(new Error("Obsolete playback request"));
  await Promise.resolve();
  expect(video).toHaveAttribute("data-video-ready", "true");
  expect(video.currentTime).toBe(5);
  dispose();
  expect(vi.getTimerCount()).toBe(0);
});
