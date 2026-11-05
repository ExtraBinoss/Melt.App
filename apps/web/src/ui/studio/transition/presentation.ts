import { animate } from "motion/react";
import type { EnginePort } from "@musart/core";
import { presentationSpring } from "../../../components/shared/motion/presentation-spring";
import { getCanonicalPresentation } from "../../../state/session/canonical-presentation";

// Opacity leaves each control's positioning transform and canvas geometry untouched.
export const workspaceChromeSelector =
  ".toolbar, .tool-settings, .inspector-tabs, .sidebar-panels, .mobile-editor-nav, .studio-chrome > *";

export function createWorkspaceChromeMotion(
  root: () => HTMLElement | null,
  reduced: () => boolean,
) {
  const originals = new Map<HTMLElement, string>();
  return {
    animate(direction: "exit" | "enter", signal: AbortSignal): Promise<void> {
      const elements = [...(root()?.querySelectorAll<HTMLElement>(workspaceChromeSelector) ?? [])];
      const animations = elements.map((element) => {
        if (!originals.has(element)) originals.set(element, element.style.opacity);
        return animate(
          element,
          { opacity: direction === "exit" ? 0 : 1 },
          reduced() ? { duration: 0 } : { ...presentationSpring, restDelta: 0.035, restSpeed: 1 },
        );
      });
      return new Promise((resolve) => {
        const abort = () => {
          for (const animation of animations) animation.stop();
          signal.removeEventListener("abort", abort);
          resolve();
        };
        if (signal.aborted) return abort();
        signal.addEventListener("abort", abort, { once: true });
        void Promise.all(animations.map((animation) => Promise.resolve(animation))).then(() => {
          signal.removeEventListener("abort", abort);
          resolve();
        });
      });
    },
    restore() {
      for (const [element, opacity] of originals) element.style.opacity = opacity;
      originals.clear();
    },
  };
}

/** Suspense lifetimes and actual presentation acknowledge readiness, never a timeout. */
export function createWorkspaceReadiness(engine: EnginePort, surface: () => HTMLElement | null) {
  const pending = new Set<object>(),
    listeners = new Set<() => void>(),
    presentation = getCanonicalPresentation(engine);
  const changed = () => {
    for (const listener of listeners) listener();
  };
  return {
    pending() {
      const token = {};
      pending.add(token);
      changed();
      return () => {
        pending.delete(token);
        changed();
      };
    },
    ready(signal: AbortSignal): Promise<void> {
      return new Promise((resolve) => {
        const root = surface(),
          view = root?.ownerDocument.defaultView;
        if (!view || !root || signal.aborted) return resolve();
        let frame: number | undefined,
          witnessedLayout = false;
        const cleanup = () => {
          if (frame !== undefined) view.cancelAnimationFrame(frame);
          stopPresentation();
          observer.disconnect();
          listeners.delete(chromeChanged);
          signal.removeEventListener("abort", finish);
        };
        const finish = () => {
          cleanup();
          resolve();
        };
        const check = () => {
          if (frame !== undefined) view.cancelAnimationFrame(frame);
          frame = undefined;
          witnessedLayout = true;
          const snapshot = engine.getSnapshot();
          const requested = presentation.read().requested;
          const canvas = root.querySelector<HTMLCanvasElement>(".editor-gpu-scene canvas");
          // Playback and gesture drafts deliberately do not acknowledge canonical tickets.
          // Their existing DOM witness still records an actually presented current GPU frame.
          const liveFrame =
            requested?.canonical === false &&
            requested.projectId === snapshot.project.id &&
            requested.revision === snapshot.revision &&
            canvas?.dataset.projectId === snapshot.project.id &&
            canvas.dataset.pageId === snapshot.pageId &&
            canvas.dataset.rendererReady === "true" &&
            canvas.dataset.presentationReady === "true";
          if (
            !pending.size &&
            (liveFrame ||
              presentation.ready({ projectId: snapshot.project.id, revision: snapshot.revision }))
          )
            finish();
        };
        const schedule = () => {
          if (frame !== undefined) return;
          // Layout effects and ResizeObserver get a frame to publish the new viewport.
          // The second frame witnesses that layout; canonical readiness still gates success.
          frame = view.requestAnimationFrame(() => {
            frame = view.requestAnimationFrame(check);
          });
        };
        const chromeChanged = () => {
          witnessedLayout = false;
          schedule();
        };
        const stopPresentation = presentation.subscribe(schedule);
        const observer = new MutationObserver(() => {
          // Playback may request its next frame before the next RAF callback. Observe
          // the real presentation immediately once the new layout has been witnessed.
          if (witnessedLayout) check();
          else schedule();
        });
        observer.observe(root, {
          subtree: true,
          childList: true,
          attributes: true,
          attributeFilter: ["data-renderer-ready", "data-presentation-ready"],
        });
        listeners.add(chromeChanged);
        signal.addEventListener("abort", finish, { once: true });
        schedule();
      });
    },
  };
}
