import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useAtom, useStore } from "jotai";
import { animate as animateFallback, useReducedMotion } from "motion/react";
import { animate } from "motion/mini";
import { spring } from "motion";
import type { EnginePort, SessionSnapshot } from "@musart/core";
import { timelineOpenAtom } from "../../state/motion/timeline-state";
import { useDocumentSnapshot } from "../../state/session/use-document-snapshot";
import { createMotionTransport } from "../../services/motion/transport";
import { TimelinePanel } from "../motion/TimelinePanel";
import type { TimelineTransport } from "../motion/model";
import { captureDockLayout } from "./layout-reservation";
import { useDockPresence } from "./use-dock-presence";
import { DockViewportReservation } from "./DockViewportReservation";
import { observeDockInteraction } from "./dock-interaction";
import { type ViewportResizeLease } from "../../canvas/session/viewport-resize";
import { presentationSpring } from "../shared/motion/presentation-spring";
import { useAnimationPresentation } from "../motion/animations/presentation";
import "./motion-shell.css";

const RetainedPanel = memo(TimelinePanel);
const peekTransform = "translateY(calc(100% - 32px))";
function rememberChoice(previous: ReadonlyMap<string, boolean>, key: string, pinned: boolean) {
  if (previous.get(key) === pinned) return previous;
  const next = new Map(previous);
  next.delete(key);
  next.set(key, pinned);
  if (next.size > 32) next.delete(next.keys().next().value!);
  return next;
}

/** Hover and pin are local presentation state; the editor roots never subscribe to them. */
export const MotionTimelineDock = memo(function MotionTimelineDock({
  engine,
}: {
  engine: EnginePort;
}) {
  const { details } = useAnimationPresentation(engine);
  const snapshot = useDocumentSnapshot(engine, details);
  const transport = useMemo(() => createMotionTransport(engine), [engine]);
  const [choices, setChoices] = useState<ReadonlyMap<string, boolean>>(() => new Map());
  const scope = JSON.stringify([snapshot.project.id, snapshot.pageId]);
  const mode =
    snapshot.project.pages.find((page) => page.id === snapshot.pageId)?.motion?.mode ?? "static";
  const [observed, setObserved] = useState({ scope, mode, pin: 0 });
  if (observed.scope !== scope) setObserved({ scope, mode, pin: 0 });
  else if (observed.mode !== mode) {
    setObserved({ scope, mode, pin: observed.pin + (mode === "motion" ? 1 : 0) });
    if (mode === "motion") setChoices((current) => rememberChoice(current, scope, true));
  }
  const remember = useCallback((key: string, pinned: boolean) => {
    setChoices((current) => rememberChoice(current, key, pinned));
  }, []);
  useEffect(() => {
    if (mode !== "motion") transport.pause();
  }, [mode, transport]);
  // Retain the last Motion surface while Static is active: its controls need not remount.
  const [retained, setRetained] = useState<SessionSnapshot | null>(null);
  const reusable =
    retained?.project === snapshot.project &&
    snapshot.project.pages.some((page) => page.id === retained.pageId);
  const shown = mode === "motion" ? snapshot : reusable ? retained : null;
  if (mode === "motion" && retained !== snapshot) setRetained(snapshot);
  else if (retained && !reusable) setRetained(null);
  const content =
    shown?.project.id === snapshot.project.id ? (
      <DockSurface
        key={JSON.stringify([shown.project.id, shown.pageId])}
        scope={JSON.stringify([shown.project.id, shown.pageId])}
        engine={engine}
        snapshot={shown}
        transport={transport}
        visible={mode === "motion"}
        initialPinned={choices.get(scope) ?? false}
        pinRequest={observed.scope === scope ? observed.pin : 0}
        remember={remember}
      />
    ) : null;
  return (
    <DockViewportReservation
      engine={engine}
      projectId={snapshot.project.id}
      layoutKey={JSON.stringify([scope, mode])}
      reserved={mode === "motion" && (choices.get(scope) ?? false)}
    >
      {content}
    </DockViewportReservation>
  );
});

function DockSurface({
  engine,
  snapshot,
  transport,
  scope,
  initialPinned,
  visible,
  pinRequest,
  remember,
}: {
  engine: EnginePort;
  snapshot: SessionSnapshot;
  transport: TimelineTransport;
  scope: string;
  initialPinned: boolean;
  visible: boolean;
  pinRequest: number;
  remember: (scope: string, pinned: boolean) => void;
}) {
  const [open, setOpen] = useAtom(timelineOpenAtom);
  const store = useStore();
  const [pinned, setPinned] = useState(initialPinned || pinRequest > 0);
  const [seenPinRequest, setSeenPinRequest] = useState(pinRequest);
  if (seenPinRequest !== pinRequest) {
    setSeenPinRequest(pinRequest);
    if (pinRequest > seenPinRequest) setPinned(true);
  }
  const present = visible;
  const [initialExpansion] = useState(initialPinned || pinRequest > 0);
  const expanded = visible && (pinned || open);
  const reduced = Boolean(useReducedMotion());
  const surface = useRef<HTMLDivElement>(null);
  const slot = useRef<HTMLDivElement>(null);
  const presenceRef = useDockPresence(present, reduced);
  const attach = useCallback(
    (node: HTMLDivElement | null) => {
      slot.current = node;
      presenceRef(node);
    },
    [presenceRef],
  );
  const captureResize = useCallback(
    () => captureDockLayout(engine, slot.current?.closest(".musart-app") ?? null),
    [engine, slot],
  );
  const interaction = useRef<ReturnType<typeof observeDockInteraction> | null>(null);
  const latest = useRef({ expanded, pinned });
  const beforeLayout = useRef<{ anchor: ViewportResizeLease; pinned: boolean } | null>(null);
  const idleFrame = useRef<number | null>(null);
  const measuredHeight = useRef(0);
  const heightAnchor = useRef<ViewportResizeLease | null>(null);
  useEffect(
    () => () => {
      beforeLayout.current?.anchor.cancel();
      heightAnchor.current?.cancel();
    },
    [],
  );
  const transitions = useRef(0),
    initialized = useRef(false);
  const beginTransition = useCallback(() => {
    transitions.current++;
    slot.current?.setAttribute("data-motion-grip-ready", "false");
    slot.current?.setAttribute("data-motion-animating", "true");
    let retired = false;
    return () => {
      if (retired) return;
      retired = true;
      if (--transitions.current === 0) {
        slot.current?.removeAttribute("data-motion-animating");
        slot.current?.setAttribute("data-motion-grip-ready", String(latest.current.expanded));
      }
    };
  }, []);
  useLayoutEffect(() => {
    latest.current = { expanded, pinned: visible && pinned };
  }, [expanded, pinned, visible]);
  // This publishes presentation intent to the external store, without a React state cascade.
  useLayoutEffect(() => {
    setOpen(initialExpansion);
  }, [initialExpansion, setOpen]);
  const measure = useCallback(() => {
    if (interaction.current?.dragging()) return;
    const panel = surface.current?.querySelector<HTMLElement>(".motion-timeline");
    if (panel && slot.current) {
      const height = panel.getBoundingClientRect().height;
      if (height !== measuredHeight.current) {
        const anchor = initialized.current && latest.current.pinned ? captureResize() : null;
        measuredHeight.current = height;
        slot.current.style.setProperty("--motion-panel-height", `${height}px`);
        if (anchor) {
          heightAnchor.current?.cancel();
          heightAnchor.current = anchor;
          anchor.apply();
        }
      }
      if (!transitions.current && !latest.current.expanded && surface.current)
        surface.current.style.transform = `translateY(${Math.max(0, height - 32)}px)`;
    }
  }, [captureResize]);
  useLayoutEffect(() => {
    const root = slot.current,
      panel = surface.current?.querySelector<HTMLElement>(".motion-timeline");
    if (!root || !panel) return;
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(panel);
    const events = observeDockInteraction(root, {
      expanded: () => latest.current.expanded,
      pinned: () => latest.current.pinned,
      open: () => setOpen(true),
      close: () => setOpen(false),
      idle: () => {
        if (idleFrame.current !== null) cancelAnimationFrame(idleFrame.current);
        idleFrame.current = requestAnimationFrame(() => {
          idleFrame.current = null;
          measure();
        });
      },
    });
    interaction.current = events;
    return () => {
      events.dispose();
      interaction.current = null;
      observer.disconnect();
      if (idleFrame.current !== null) cancelAnimationFrame(idleFrame.current);
    };
  }, [measure, setOpen]);
  useEffect(() => {
    interaction.current?.refresh();
  }, [expanded, pinned]);
  useLayoutEffect(() => {
    const node = surface.current,
      root = slot.current;
    if (!node || !root) return;
    const offset = Math.max(0, node.getBoundingClientRect().height - 32);
    const first = !initialized.current;
    initialized.current = true;
    if (first) node.style.transform = `translateY(${offset + 32}px)`;
    const target = `translateY(${expanded ? 0 : offset}px)`;
    if (reduced) {
      node.style.transform = target;
      node.style.opacity = expanded ? "1" : ".98";
      root.dataset.motionBodyHidden = String(!expanded);
      root.dataset.motionGripReady = String(expanded);
      return;
    }
    let cancelled = false;
    const finishTransition = beginTransition();
    // Hide the grip before revealing the moving body, including interrupted reentries.
    root.dataset.motionBodyHidden = String(first && !expanded);
    let stop = () => {};
    const frame = requestAnimationFrame(() => {
      const values = { transform: target, opacity: expanded ? 1 : 0.98 };
      const animation =
        typeof node.animate === "function"
          ? animate(node, values, { ...presentationSpring, type: spring })
          : animateFallback(node, values, presentationSpring);
      stop = () => animation.stop();
      void animation.then(() => {
        finishTransition();
        if (!cancelled && !expanded) root.dataset.motionBodyHidden = "true";
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      stop();
      finishTransition();
    };
  }, [beginTransition, expanded, reduced]);
  useLayoutEffect(() => {
    const before = beforeLayout.current;
    if (before && before.pinned !== pinned) return;
    beforeLayout.current = null;
    if (!before) return;
    const finishTransition = beginTransition();
    before.anchor.apply();
    void before.anchor.finished.then(finishTransition);
    return () => {
      before.anchor.cancel();
      finishTransition();
    };
  }, [beginTransition, pinned]);
  const captureLayout = useCallback(
    (nextPinned: boolean) => {
      measure();
      beforeLayout.current?.anchor.cancel();
      const anchor = captureResize();
      beforeLayout.current = anchor ? { anchor, pinned: nextPinned } : null;
    },
    [measure, captureResize],
  );
  const pin = useCallback(() => {
    const nextPinned = !latest.current.pinned;
    captureLayout(nextPinned);
    setPinned(nextPinned);
    setOpen(true);
    remember(scope, nextPinned);
  }, [captureLayout, remember, scope, setOpen]);
  const close = useCallback(() => {
    if (!latest.current.expanded) {
      setOpen(true);
      return;
    }
    if (latest.current.pinned) captureLayout(false);
    interaction.current?.dismiss();
    setPinned(false);
    remember(scope, false);
    setOpen(false);
    document.querySelector<HTMLElement>(".canvas-timeline-toggle")?.focus({ preventScroll: true });
  }, [captureLayout, remember, scope, setOpen]);
  useLayoutEffect(
    () =>
      store.sub(timelineOpenAtom, () => {
        if (!store.get(timelineOpenAtom) && latest.current.pinned) close();
      }),
    [close, store],
  );
  return (
    <div
      ref={attach}
      className="motion-timeline-dock"
      data-motion-exiting={String(!present)}
      inert={!present || undefined}
      style={{ opacity: 0, transform: "translateY(32px)" }}
      aria-hidden={!present || undefined}
      data-motion-presence={expanded ? "present" : "peek"}
      data-motion-expanded={String(expanded)}
      data-motion-pinned={String(pinned)}
      data-motion-body-hidden="true"
      data-motion-grip-ready="false"
      data-motion-scope={scope}
      data-canvas-control
    >
      <div className="motion-timeline-viewport">
        <div
          ref={surface}
          className="motion-timeline-surface"
          style={{ transform: peekTransform, opacity: 0.98 }}
        >
          <RetainedPanel
            engine={engine}
            snapshot={snapshot}
            transport={transport}
            expanded={expanded}
            pinned={pinned}
            onPin={pin}
            onClose={close}
            active={present}
          />
        </div>
      </div>
    </div>
  );
}
