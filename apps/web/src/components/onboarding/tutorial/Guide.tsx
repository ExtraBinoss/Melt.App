import { placeGuide } from "./placement";
import { visible as visibleSurface } from "./surfaces";
import { Speech } from "./Speech";
import { X } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, useReducedMotion } from "motion/react";
import type { EnginePort } from "@musart/core";
import { MeltLogo } from "../../../ui/brand/MeltLogo";
import { Button } from "../../ui/button";
import { copy, steps } from "./content";

export function Guide({
  index,
  engine,
  busy,
  error,
  onSkip,
  onExit,
  onPrevious,
}: {
  index: number;
  engine: EnginePort;
  busy: boolean;
  error: string;
  onSkip: () => void;
  onExit: () => void;
  onPrevious: () => void;
}) {
  const step = steps[index]!;
  const last = index === steps.length - 1;
  const reduce = useReducedMotion();
  const [rect, setRect] = useState({ x: 20, y: 20, width: 0, height: 0 });
  const [position, setPosition] = useState({ index: -1, x: 12, y: 12 });
  const [viewport, setViewport] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
    offsetX: 0,
    offsetY: 0,
  });
  const card = useRef<HTMLElement>(null);
  const overlay = useRef<HTMLDivElement>(null);
  const [cardHeight, setCardHeight] = useState(280);
  useLayoutEffect(() => {
    let frame = 0;
    let observed: Element | null = null;
    let acquired = false;
    const measure = () => {
      frame = 0;
      const visible = (selector: string) => visibleSurface(selector, true);
      const primary = visible(step.target);
      const transientMenu = "action" in step && ["transition", "pop"].includes(step.action);
      if (!primary && acquired && transientMenu) return;
      if (primary) acquired = true;
      const target =
        primary ??
        ("action" in step && step.action === "dither"
          ? visible('.effect-catalog[data-effect-category="effect"] input')
          : null) ??
        ("action" in step && step.action === "pop" ? visible(".animation-picker") : null) ??
        (!("action" in step) ? visible(".canvas-artboard") : null) ??
        null;
      if (target !== observed) {
        if (observed) resize.unobserve(observed);
        if (target) resize.observe(target);
        observed = target;
      }
      const surface =
        "action" in step && step.action === "dither"
          ? visible(".effect-catalog-menu")
          : "action" in step && step.action === "pop"
            ? visible(".motion-animation-popover")
            : "action" in step && step.action === "transition"
              ? primary?.closest<HTMLElement>('[role="menu"]')
              : target;
      const anchorBox = surface?.getBoundingClientRect();
      const rawBox = target?.getBoundingClientRect();
      const dialog = document.querySelector<HTMLElement>(".export-dialog");
      const frameBox = overlay.current?.getBoundingClientRect();
      const cardHeight = card.current?.getBoundingClientRect().height ?? 280;
      const bounds = {
        width: dialog?.clientWidth ?? innerWidth,
        height: dialog?.clientHeight ?? innerHeight,
        offsetX: dialog?.scrollLeft ?? 0,
        offsetY: dialog?.scrollTop ?? 0,
      };
      const box = rawBox
        ? {
            x: rawBox.x - (frameBox?.x ?? 0),
            y: rawBox.y - (frameBox?.y ?? 0),
            width: rawBox.width,
            height: rawBox.height,
          }
        : undefined;
      setCardHeight(cardHeight);
      if (anchorBox) {
        const next = {
          x: anchorBox.x - (frameBox?.x ?? 0),
          y: anchorBox.y - (frameBox?.y ?? 0),
          width: anchorBox.width,
          height: anchorBox.height,
        };
        setPosition((old) => {
          const nextPosition = placeGuide(
            { ...next, x: next.x - bounds.offsetX, y: next.y - bounds.offsetY },
            bounds,
            Math.min(330, bounds.width - 24),
            cardHeight,
            old.index === index ? old : undefined,
          );
          return old.index === index && old.x === nextPosition.x && old.y === nextPosition.y
            ? old
            : { index, ...nextPosition };
        });
      }
      if (!box) setRect((old) => (old.width ? { x: 0, y: 0, width: 0, height: 0 } : old));
      if (box)
        setRect((old) =>
          old.x === box.x && old.y === box.y && old.width === box.width && old.height === box.height
            ? old
            : { x: box.x, y: box.y, width: box.width, height: box.height },
        );
      setViewport((old) =>
        old.width === (dialog?.clientWidth ?? innerWidth) &&
        old.height === (dialog?.clientHeight ?? innerHeight) &&
        old.offsetX === (dialog?.scrollLeft ?? 0) &&
        old.offsetY === (dialog?.scrollTop ?? 0)
          ? old
          : {
              width: dialog?.clientWidth ?? innerWidth,
              height: dialog?.clientHeight ?? innerHeight,
              offsetX: dialog?.scrollLeft ?? 0,
              offsetY: dialog?.scrollTop ?? 0,
            },
      );
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    const resize = new ResizeObserver(schedule);
    if (card.current) resize.observe(card.current);
    const mutations = new MutationObserver((records) => {
      if (
        records.some(
          (record) =>
            !(record.target instanceof Element) || !record.target.closest(".tutorial-overlay"),
        )
      )
        schedule();
    });
    mutations.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["style", "class", "data-state", "aria-expanded"],
    });
    const stop = engine.subscribe(schedule);
    document.addEventListener("animationend", schedule, true);
    document.addEventListener("transitionend", schedule, true);
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    measure();
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      mutations.disconnect();
      stop();
      document.removeEventListener("animationend", schedule, true);
      document.removeEventListener("transitionend", schedule, true);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
    };
  }, [step, engine, index]);
  const width = Math.min(330, viewport.width - 24);
  const placement =
    index === 0 || last
      ? { x: (viewport.width - width) / 2, y: Math.max(12, (viewport.height - cardHeight) / 2) }
      : position;
  const x = placement.x + viewport.offsetX,
    y = placement.y + viewport.offsetY;
  const pointsRight = x + width / 2 < rect.x + rect.width / 2;
  return createPortal(
    <div
      ref={overlay}
      className="tutorial-overlay"
      style={document.querySelector(".export-dialog") ? { position: "absolute" } : undefined}
    >
      {!last && rect.width > 0 && (
        <motion.div
          className="tutorial-highlight"
          animate={{ x: rect.x - 4, y: rect.y - 4, width: rect.width + 8, height: rect.height + 8 }}
          transition={{ duration: reduce ? 0 : 0.25 }}
        />
      )}
      <motion.aside
        ref={card}
        role="region"
        aria-label="Melt tutorial"
        className="tutorial-card"
        style={{ width }}
        initial={false}
        animate={{ x, y }}
        transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 340, damping: 32 }}
      >
        <header>
          {last ? (
            <MeltLogo size={48} lively />
          ) : (
            <motion.div
              className="tutorial-mascot"
              initial={false}
              animate={
                "action" in step
                  ? {
                      x: Math.max(
                        -x + 8,
                        Math.min(
                          viewport.width - x - 72,
                          pointsRight ? rect.x - x - 72 : rect.x + rect.width - x + 8,
                        ),
                      ),
                      y: rect.y + rect.height / 2 - y - 42,
                      scale: 1.25,
                      rotate: pointsRight ? 0 : 180,
                    }
                  : { x: 0, y: 0, scale: 1, rotate: 0 }
              }
              transition={
                reduce ? { duration: 0 } : { type: "spring", stiffness: 260, damping: 28 }
              }
            >
              <MeltLogo size={48} lively shape={"action" in step ? "pointer" : "mascot"} />
            </motion.div>
          )}
          <span>
            {index + 1} / {steps.length}
          </span>
          <Button variant="ghost" size="icon-sm" aria-label={copy.exit} onClick={onExit}>
            <X size={16} />
          </Button>
        </header>
        <h2>{step.title}</h2>
        <Speech text={step.text} />
        {error && <p role="alert">{error}</p>}
        <footer>
          <Button
            className="tutorial-previous"
            variant="ghost"
            disabled={busy || index === 0}
            onClick={onPrevious}
          >
            {copy.previous}
          </Button>
          <Button disabled={busy} onClick={onSkip}>
            {index === steps.length - 1 ? copy.finish : copy.next}
          </Button>
        </footer>
      </motion.aside>
    </div>,
    document.querySelector(".export-dialog") ?? document.body,
  );
}
