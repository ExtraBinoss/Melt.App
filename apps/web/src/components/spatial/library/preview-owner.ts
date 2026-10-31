import { applyMotionFrame, compileMotion, evaluateMotion, type Project } from "@musart/core";
import type { createRenderSession } from "@musart/render";
import type { SpatialLibraryModels } from "../../../services/assets/spatial-library";
import type { SpatialLibraryEntry } from "./catalog";
import { spatialLibraryDocument } from "./document";

/** One retained native renderer for all tiles, with one in-flight frame and no React clock. */
export function createSpatialLibraryPreview(
  host: HTMLElement,
  store: SpatialLibraryModels,
  onError: (error: unknown) => void,
) {
  const surface = host.parentElement!;
  let alive = true,
    generation = 0,
    frameHandle = 0,
    pending = false,
    dirty = true,
    lastFrame = -Infinity,
    frames = 0;
  let session: ReturnType<typeof createRenderSession> | null = null;
  let current: { project: Project; program: ReturnType<typeof compileMotion> } | null = null;
  let source = new AbortController(),
    started = performance.now(),
    held = 0,
    dragging = false;
  let yaw = 25,
    pitch = 35,
    distance = 5.2;
  let pointer: { id: number; x: number; y: number } | null = null;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const init = import("@musart/render").then((module) => {
    if (alive) session = module.createRenderSession({ maxBytes: 96 * 1024 * 1024 });
  });
  const schedule = () => {
    if (alive && !frameHandle && !document.hidden) frameHandle = requestAnimationFrame(draw);
  };
  function draw(now: number) {
    frameHandle = 0;
    if (!alive || !current || !session || document.hidden) return;
    if (pending || now - lastFrame < 1000 / 30) {
      schedule();
      return;
    }
    if (!dirty && (reduced.matches || dragging)) return;
    lastFrame = now;
    dirty = false;
    pending = true;
    const token = generation,
      signal = source.signal;
    const time = reduced.matches ? 0 : dragging ? held : ((now - started) / 1000) % 6;
    const plan = evaluateMotion(current.program, { value: Math.round(time * 60000), rate: 60000 });
    const original = applyMotionFrame(current.program, plan);
    const page = {
      ...original,
      spatial: {
        ...original.spatial!,
        camera: { ...original.spatial!.camera, yaw, pitch, distance },
      },
    };
    void session
      .withCanvasFrame(
        page,
        current.project.assets,
        (canvas) => {
          if (!alive || token !== generation) return;
          if (host.firstChild !== canvas) host.replaceChildren(canvas);
          canvas.className = "spatial-live-canvas";
          surface.dataset.ready = "true";
          surface.dataset.previewFrames = String(++frames);
          surface.dataset.backend = session?.stats()?.backend ?? "unknown";
        },
        {
          scale: Math.min(320, Math.max(160, 160 * devicePixelRatio)) / 256,
          motionFrame: plan,
          signal,
          canRender: () => alive && token === generation,
        },
      )
      .catch((error) => {
        if (alive && !signal.aborted && token === generation) {
          current = null;
          surface.dataset.previewStatus = "failed";
          onError(error);
        }
      })
      .finally(() => {
        pending = false;
        if (alive && current && (!reduced.matches || dirty)) schedule();
      });
  }
  const visibility = () => {
    if (document.hidden) {
      cancelAnimationFrame(frameHandle);
      frameHandle = 0;
    } else {
      dirty = true;
      schedule();
    }
  };
  const changeMotion = () => {
    dirty = true;
    schedule();
  };
  const down = (event: PointerEvent) => {
    if (event.button !== 0) return;
    dragging = true;
    held = ((performance.now() - started) / 1000) % 6;
    pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
    surface.setPointerCapture(event.pointerId);
    surface.dataset.dragging = "true";
    surface.focus({ preventScroll: true });
    event.preventDefault();
  };
  const move = (event: PointerEvent) => {
    if (!pointer || event.pointerId !== pointer.id) return;
    yaw += (event.clientX - pointer.x) * 0.6;
    pitch = Math.max(-85, Math.min(85, pitch + (event.clientY - pointer.y) * 0.6));
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    dirty = true;
    schedule();
  };
  const up = () => {
    if (!pointer) return;
    if (pointer && surface.hasPointerCapture(pointer.id)) surface.releasePointerCapture(pointer.id);
    pointer = null;
    dragging = false;
    started = performance.now() - held * 1000;
    surface.dataset.dragging = "false";
    dirty = true;
    schedule();
  };
  const key = (event: KeyboardEvent) => {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "+", "-"].includes(event.key))
      return;
    event.preventDefault();
    event.stopPropagation();
    if (event.key === "Home") {
      yaw = 25;
      pitch = 35;
      distance = 5.2;
    }
    if (event.key === "ArrowLeft") yaw -= 10;
    if (event.key === "ArrowRight") yaw += 10;
    if (event.key === "ArrowUp") pitch = Math.max(-85, pitch - 10);
    if (event.key === "ArrowDown") pitch = Math.min(85, pitch + 10);
    if (event.key === "+") distance = Math.max(2.5, distance - 0.3);
    if (event.key === "-") distance = Math.min(8, distance + 0.3);
    dirty = true;
    schedule();
  };
  surface.addEventListener("pointerdown", down);
  surface.addEventListener("pointermove", move);
  surface.addEventListener("pointerup", up);
  surface.addEventListener("pointercancel", up);
  surface.addEventListener("keydown", key);
  window.addEventListener("blur", up);
  document.addEventListener("visibilitychange", visibility);
  reduced.addEventListener("change", changeMotion);
  return {
    async setEntry(entry: SpatialLibraryEntry) {
      source.abort();
      source = new AbortController();
      const signal = source.signal,
        token = ++generation;
      current = null;
      surface.dataset.ready = "false";
      surface.dataset.previewStatus = "loading";
      surface.dataset.entry = entry.id;
      yaw = 25;
      pitch = 35;
      distance = 5.2;
      try {
        const [asset] = await Promise.all([
          entry.kind === "model" ? store.load(entry.model, signal) : Promise.resolve(undefined),
          init,
        ]);
        if (!alive || signal.aborted || token !== generation) return;
        const project = spatialLibraryDocument(entry, asset);
        current = {
          project,
          program: compileMotion(project, { compositionId: project.pages[0]!.id }),
        };
        started = performance.now();
        held = 0;
        dirty = true;
        surface.dataset.previewStatus = "playing";
        schedule();
      } catch (error) {
        if (alive && !signal.aborted && token === generation) {
          surface.dataset.previewStatus = "failed";
          onError(error);
        }
      }
    },
    async stop() {
      if (!alive) return;
      alive = false;
      source.abort();
      generation++;
      cancelAnimationFrame(frameHandle);
      if (pointer && surface.hasPointerCapture(pointer.id))
        surface.releasePointerCapture(pointer.id);
      pointer = null;
      surface.removeEventListener("pointerdown", down);
      surface.removeEventListener("pointermove", move);
      surface.removeEventListener("pointerup", up);
      surface.removeEventListener("pointercancel", up);
      surface.removeEventListener("keydown", key);
      window.removeEventListener("blur", up);
      document.removeEventListener("visibilitychange", visibility);
      reduced.removeEventListener("change", changeMotion);
      await init.catch(() => {});
      await session?.dispose();
      host.replaceChildren();
    },
  };
}
