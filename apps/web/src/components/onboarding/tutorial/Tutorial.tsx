import { useStepSurface } from "./use-step-surface";
import { useEffect, useRef, useState } from "react";
import type { EnginePort } from "@musart/core";
import type { EditorServices } from "../../../state/contracts";
import { createMotionTransport } from "../../../services/motion/transport";
import { getExportJobs } from "../../../services/export/jobs";
import { requestCompositionExport } from "../../export/composition-request";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "../../ui/dialog";
import { Button } from "../../ui/button";
import { MeltLogo } from "../../../ui/brand/MeltLogo";
import { Guide } from "./Guide";
import { copy, steps } from "./content";
import { addDither, addPop, createPracticeProject } from "./project";
import "./tutorial.css";

export const TUTORIAL_KEY = "musart.editor-tutorial.v1";
export const REPLAY_TUTORIAL = "melt:replay-editor-tutorial";
function unseen() {
  try {
    return localStorage.getItem(TUTORIAL_KEY) !== "done";
  } catch {
    return true;
  }
}
function click(selector: string) {
  const element = document.querySelector<HTMLButtonElement>(selector);
  if (!element || element.disabled)
    throw new Error("This control is not ready yet. Please try again.");
  if (element.tagName === "BUTTON" && element.getAttribute("aria-haspopup") === "menu") {
    element.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        button: 0,
        pointerType: "mouse",
        ctrlKey: false,
      }),
    );
    element.dispatchEvent(
      new PointerEvent("pointerup", { bubbles: true, button: 0, pointerType: "mouse" }),
    );
  } else element.click();
}
export function Tutorial({
  engine,
  services,
  hidden,
  onProjectCreated,
}: {
  engine: EnginePort;
  services: EditorServices;
  hidden: boolean;
  onProjectCreated?: (id: string) => void;
}) {
  const [phase, setPhase] = useState<"invite" | "tour" | "closed">(() =>
    unseen() ? "invite" : "closed",
  );
  const [index, setIndex] = useState(0);
  const [leave, setLeave] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const furthest = useRef(0);
  const practice = useRef<{ projectId: string; layerId: string } | null>(null);
  useStepSurface(engine, index, phase === "tour" && !hidden && !leave, practice);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    const replay = () => {
      setPhase("invite");
      setIndex(0);
      setError("");
    };
    window.addEventListener(REPLAY_TUTORIAL, replay);
    return () => window.removeEventListener(REPLAY_TUTORIAL, replay);
  }, []);
  function close() {
    createMotionTransport(engine).pause();
    try {
      localStorage.setItem(TUTORIAL_KEY, "done");
    } catch {
      /* Session remains usable when preferences cannot be stored. */
    }
    setPhase("closed");
    setLeave(false);
  }
  const advance = () => {
    setError("");
    setIndex((value) => {
      const next = Math.min(steps.length - 1, value + 1);
      furthest.current = Math.max(furthest.current, next);
      return next;
    });
  };
  useEffect(() => {
    if (phase !== "tour" || hidden || leave || index < furthest.current) return;
    const transport = createMotionTransport(engine);
    const jobs = getExportJobs(engine);
    let completed = false;
    let pinPrepared = false;
    const check = () => {
      if (completed) return;
      const snapshot = engine.getSnapshot();
      if (snapshot.project.id !== practice.current?.projectId) {
        setPhase("closed");
        return;
      }
      const page = snapshot.project.pages.find((page) => page.id === snapshot.pageId)!;
      const layer = page.layers.find((layer) => layer.id === practice.current?.layerId);
      const action = "action" in steps[index]! ? steps[index]!.action : undefined;
      if (action === "pin" && !pinPrepared) {
        const pin = document.querySelector<HTMLButtonElement>(
          '[data-tutorial="timeline-pin"][aria-pressed="true"]',
        );
        const dock = document.querySelector("[data-motion-pinned]");
        if (!dock) return;
        pinPrepared = true;
        if (pin) pin.click();
        return;
      }
      const done =
        action === "select"
          ? snapshot.selection.includes(practice.current.layerId)
          : action === "effectMenu"
            ? document
                .querySelector('.layer-create-actions button[aria-haspopup="menu"]')
                ?.getAttribute("data-state") === "open"
            : action === "effectCategory"
              ? !!document.querySelector('.effect-catalog[data-effect-category="effect"]')
              : action === "dither"
                ? layer?.effects.some((effect) => effect.type === "dither")
                : action === "motion"
                  ? page.motion?.mode === "motion"
                  : action === "pin"
                    ? !!document.querySelector('[data-motion-pinned="true"]')
                    : action === "pop"
                      ? page.motion?.tracks.some(
                          (track) =>
                            track.layerId === layer?.id &&
                            track.animations?.some(
                              (animation) => animation.preset.id === "scale-pop",
                            ),
                        )
                      : action === "play"
                        ? transport.read().playing
                        : action === "export"
                          ? !!document.querySelector(".export-dialog")
                          : action === "video"
                            ? !!document.querySelector(".motion-export-preview-surface")
                            : action === "render"
                              ? jobs.read()?.kind === "motion" && jobs.read()?.status === "complete"
                              : false;
      if (done) {
        completed = true;
        advance();
      }
    };
    const stop = engine.subscribe(check),
      stopTransport = transport.subscribe(check),
      stopJobs = jobs.subscribe(check);
    const observer = new MutationObserver(check);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-motion-pinned", "data-state"],
    });
    check();
    return () => {
      stop();
      stopTransport();
      stopJobs();
      observer.disconnect();
    };
  }, [engine, hidden, index, phase, leave]);
  async function start() {
    setBusy(true);
    setError("");
    try {
      practice.current = await createPracticeProject(engine, services);
      if (alive.current) {
        onProjectCreated?.(practice.current.projectId);
        furthest.current = 0;
        setIndex(0);
        setPhase("tour");
      }
    } catch (cause) {
      if (alive.current) setError(cause instanceof Error ? cause.message : copy.error);
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  function skip() {
    setError("");
    try {
      if (index < furthest.current) {
        advance();
        return;
      }
      const step = steps[index]!;
      if (index === steps.length - 1) {
        close();
        return;
      }
      if (!("action" in step)) {
        advance();
        return;
      }
      const id = practice.current!.layerId;
      switch (step.action) {
        case "select":
          engine.select([id]);
          break;
        case "effectMenu":
          click('.layer-create-actions button[aria-haspopup="menu"]');
          break;
        case "effectCategory":
          // The next surface opens the library even if clicking Next dismissed its parent menu.
          advance();
          break;
        case "dither":
          addDither(engine, id);
          document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
          break;
        case "motion":
          engine.execute({ type: "setCompositionMode", mode: "motion" });
          break;
        case "pin":
          if (!document.querySelector('[data-motion-pinned="true"]'))
            click('[data-tutorial="timeline-pin"][aria-pressed="false"]');
          break;
        case "pop":
          addPop(engine, id);
          document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
          break;
        case "play":
          createMotionTransport(engine).play();
          break;
        case "export":
          requestCompositionExport(engine, engine.getSnapshot().pageId);
          break;
        case "video":
          click('.export-dialog button[data-segmented-value="motion"]');
          break;
        case "render":
          click(".export-dialog .export-submit");
          break;
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : copy.error);
    }
  }
  if (hidden || phase === "closed") return null;
  return (
    <>
      {phase === "tour" && !leave && (
        <Guide
          index={index}
          engine={engine}
          busy={busy}
          error={error}
          onSkip={skip}
          onPrevious={() => {
            setError("");
            setIndex((value) => Math.max(0, value - 1));
          }}
          onExit={() => setLeave(true)}
        />
      )}
      <Dialog
        open={phase === "invite" || leave}
        onOpenChange={(open) => {
          if (!open && !busy) {
            if (leave) setLeave(false);
            else close();
          }
        }}
      >
        <DialogContent
          className="tutorial-invite"
          showCloseButton={false}
          onInteractOutside={(event) => event.preventDefault()}
        >
          <MeltLogo size={80} lively />
          <DialogTitle>{leave ? copy.leave : copy.invite}</DialogTitle>
          <DialogDescription>{leave ? copy.leaveDetail : copy.detail}</DialogDescription>
          {error && <p role="alert">{error}</p>}
          <footer>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => (leave ? setLeave(false) : close())}
            >
              {leave ? copy.stay : copy.no}
            </Button>
            <Button disabled={busy} onClick={() => (leave ? close() : void start())}>
              {leave ? copy.exit : busy ? "Loading…" : copy.yes}
            </Button>
          </footer>
        </DialogContent>
      </Dialog>
    </>
  );
}
