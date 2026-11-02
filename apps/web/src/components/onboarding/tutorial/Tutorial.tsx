import { performStep, stepDone, waitForTutorial } from "./actions";
import { useStepSurface } from "./use-step-surface";
import { useEffect, useRef, useState } from "react";
import type { EnginePort } from "@musart/core";
import type { EditorServices } from "../../../state/contracts";
import { createMotionTransport } from "../../../services/motion/transport";
import { getExportJobs } from "../../../services/export/jobs";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "../../ui/dialog";
import { Button } from "../../ui/button";
import { MeltLogo } from "../../../ui/brand/MeltLogo";
import { Guide } from "./Guide";
import { copy, steps } from "./content";
import { createPracticeProject } from "./project";
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
  const [layerId, setLayerId] = useState<string>();
  const furthest = useRef(0);
  const cursor = useRef(0);
  const pending = useRef(0);
  const running = useRef(false);
  const operation = useRef<AbortController | null>(null);
  const pinReady = useRef(-1);
  const practice = useRef<{ projectId: string; layerId: string } | null>(null);
  useStepSurface(engine, index, phase === "tour" && !hidden && !leave, practice, setError);
  const alive = useRef(true);
  useEffect(() => {
    if (hidden) {
      pending.current = 0;
      operation.current?.abort();
    }
  }, [hidden]);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      operation.current?.abort();
    };
  }, []);
  useEffect(() => {
    const replay = () => {
      operation.current?.abort();
      pending.current = 0;
      cursor.current = 0;
      setPhase("invite");
      setIndex(0);
      setError("");
    };
    window.addEventListener(REPLAY_TUTORIAL, replay);
    return () => window.removeEventListener(REPLAY_TUTORIAL, replay);
  }, []);
  function close() {
    pending.current = 0;
    operation.current?.abort();
    createMotionTransport(engine).pause();
    try {
      localStorage.setItem(TUTORIAL_KEY, "done");
    } catch {
      /* Session remains usable when preferences cannot be stored. */
    }
    setPhase("closed");
    setLeave(false);
  }
  const advance = (expected: number) => {
    if (cursor.current !== expected) return;
    const next = Math.min(steps.length - 1, expected + 1);
    cursor.current = next;
    furthest.current = Math.max(furthest.current, next);
    setError("");
    setIndex(next);
  };
  useEffect(() => {
    if (phase !== "tour" || hidden || leave || index < furthest.current) return;
    const transport = createMotionTransport(engine);
    const jobs = getExportJobs(engine);
    let completed = false;
    let pinPrepared = false;
    let pinRequested = false;
    const check = () => {
      if (completed || cursor.current !== index) return;
      const snapshot = engine.getSnapshot();
      if (snapshot.project.id !== practice.current?.projectId) {
        setPhase("closed");
        return;
      }
      const action = "action" in steps[index]! ? steps[index]!.action : undefined;
      if (action === "pin" && !pinPrepared) {
        const pin = document.querySelector<HTMLButtonElement>(
          '[data-tutorial="timeline-pin"][aria-pressed="true"]',
        );
        const dock = document.querySelector("[data-motion-pinned]");
        if (!dock) return;
        if (pin) {
          if (!pinRequested) {
            pinRequested = true;
            pin.click();
          }
          return;
        }
        pinPrepared = true;
        pinReady.current = index;
        return;
      }
      const done = action ? stepDone(action, { engine, ...practice.current! }) : false;
      if (done) {
        completed = true;
        advance(index);
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
      attributeFilter: ["data-motion-pinned", "data-state", "aria-expanded"],
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
        setLayerId(practice.current.layerId);
        onProjectCreated?.(practice.current.projectId);
        furthest.current = 0;
        cursor.current = 0;
        pinReady.current = -1;
        setIndex(0);
        setPhase("tour");
      }
    } catch (cause) {
      if (alive.current) setError(cause instanceof Error ? cause.message : copy.error);
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  async function skip() {
    pending.current = Math.min(32, pending.current + 1);
    if (running.current) return;
    running.current = true;
    const controller = new AbortController();
    operation.current = controller;
    try {
      while (pending.current > 0 && !controller.signal.aborted && alive.current) {
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        if (controller.signal.aborted) break;
        pending.current--;
        const expected = cursor.current;
        const step = steps[expected]!;
        if (expected === steps.length - 1) {
          close();
          break;
        }
        if ("action" in step) {
          const context = { engine, ...practice.current! };
          if (step.action === "pin" && expected >= furthest.current)
            await waitForTutorial(context, () => pinReady.current === expected, controller.signal);
          await performStep(step.action, context, controller.signal);
          await waitForTutorial(
            context,
            () => cursor.current !== expected || stepDone(step.action, context),
            controller.signal,
          );
        }
        if (!controller.signal.aborted) advance(expected);
      }
    } catch (cause) {
      pending.current = 0;
      if (!controller.signal.aborted && alive.current)
        setError(cause instanceof Error ? cause.message : copy.error);
    } finally {
      running.current = false;
      if (operation.current === controller) operation.current = null;
    }
  }
  if (hidden || phase === "closed") return null;
  return (
    <>
      {phase === "tour" && !leave && (
        <Guide
          index={index}
          engine={engine}
          layerId={layerId}
          busy={busy}
          error={error}
          onSkip={() => void skip()}
          onPrevious={() => {
            pending.current = 0;
            operation.current?.abort();
            cursor.current = Math.max(0, cursor.current - 1);
            const exportIndex = steps.findIndex(
              (step) => "action" in step && step.action === "export",
            );
            if (cursor.current <= exportIndex)
              document
                .querySelector<HTMLButtonElement>('.export-dialog [data-slot="dialog-close"]')
                ?.click();
            setError("");
            setIndex(cursor.current);
          }}
          onExit={() => {
            pending.current = 0;
            operation.current?.abort();
            setLeave(true);
          }}
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
