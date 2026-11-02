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
  const reduce = useReducedMotion();
  const [rect, setRect] = useState({ x: 20, y: 20, width: 0, height: 0 });
  const [anchor, setAnchor] = useState({ x: 20, y: 20, width: 0, height: 0 });
  const [viewport, setViewport] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
  });
  const card = useRef<HTMLElement>(null);
  const [cardHeight, setCardHeight] = useState(280);
  useLayoutEffect(() => {
    const node = card.current;
    if (!node) return;
    const observer = new ResizeObserver(() => setCardHeight(node.getBoundingClientRect().height));
    observer.observe(node);
    setCardHeight(node.getBoundingClientRect().height);
    return () => observer.disconnect();
  }, []);
  useLayoutEffect(() => {
    let frame = 0;
    let observed: Element | null = null;
    const measure = () => {
      frame = 0;
      const visible = (selector: string) => visibleSurface(selector, true);
      const target =
        visible(step.target) ??
        ("action" in step && step.action === "dither"
          ? visible('.effect-catalog[data-effect-category="effect"] input')
          : null) ??
        ("action" in step && step.action === "pop" ? visible(".animation-picker") : null) ??
        visible(".canvas-artboard") ??
        null;
      if (target !== observed) {
        if (observed) resize.unobserve(observed);
        if (target) resize.observe(target);
        observed = target;
      }
      const surface =
        "action" in step && step.action === "dither" ? visible(".effect-catalog-menu") : target;
      const anchorBox = surface?.getBoundingClientRect();
      const rawBox = target?.getBoundingClientRect();
      const dialog = document.querySelector(".export-dialog")?.getBoundingClientRect();
      const box = rawBox
        ? {
            x: rawBox.x - (dialog?.x ?? 0),
            y: rawBox.y - (dialog?.y ?? 0),
            width: rawBox.width,
            height: rawBox.height,
          }
        : undefined;
      if (anchorBox) {
        const next = {
          x: anchorBox.x - (dialog?.x ?? 0),
          y: anchorBox.y - (dialog?.y ?? 0),
          width: anchorBox.width,
          height: anchorBox.height,
        };
        setAnchor((old) =>
          old.x === next.x &&
          old.y === next.y &&
          old.width === next.width &&
          old.height === next.height
            ? old
            : next,
        );
      }
      if (!box) setRect((old) => (old.width ? { x: 0, y: 0, width: 0, height: 0 } : old));
      if (box)
        setRect((old) =>
          old.x === box.x && old.y === box.y && old.width === box.width && old.height === box.height
            ? old
            : { x: box.x, y: box.y, width: box.width, height: box.height },
        );
      setViewport((old) =>
        old.width === (dialog?.width ?? innerWidth) &&
        old.height === (dialog?.height ?? innerHeight)
          ? old
          : { width: dialog?.width ?? innerWidth, height: dialog?.height ?? innerHeight },
      );
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    const resize = new ResizeObserver(schedule);
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
  }, [step, engine]);
  const width = Math.min(330, viewport.width - 24);
  const placement =
    index === 0
      ? { x: (viewport.width - width) / 2, y: Math.max(12, (viewport.height - cardHeight) / 2) }
      : placeGuide(anchor, viewport, width, cardHeight);
  const { x, y } = placement;
  return createPortal(
    <div
      className="tutorial-overlay"
      style={document.querySelector(".export-dialog") ? { position: "absolute" } : undefined}
    >
      {rect.width > 0 && (
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
          <motion.div
            className="tutorial-mascot"
            initial={false}
            animate={
              "action" in step
                ? {
                    x: Math.max(-x + 8, Math.min(viewport.width - x - 72, rect.x - x - 72)),
                    y: rect.y + rect.height / 2 - y - 42,
                    scale: 1.25,
                  }
                : { x: 0, y: 0, scale: 1 }
            }
            transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 260, damping: 28 }}
          >
            <MeltLogo size={48} lively shape={"action" in step ? "pointer" : "mascot"} />
          </motion.div>
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
