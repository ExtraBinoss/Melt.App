import { ArrowLeft, X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
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
  const [viewport, setViewport] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
  });
  const text = useRef<HTMLParagraphElement>(null);
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
  useEffect(() => {
    if (reduce || !text.current) return;
    let count = 0;
    const node = text.current;
    node.textContent = "";
    const timer = setInterval(() => {
      count += 5;
      node.textContent = step.text.slice(0, count);
      if (count >= step.text.length) clearInterval(timer);
    }, 12);
    return () => clearInterval(timer);
  }, [step, reduce]);
  useLayoutEffect(() => {
    let frame = 0;
    let observed: Element | null = null;
    const measure = () => {
      frame = 0;
      const target =
        document.querySelector(step.target) ??
        ("action" in step && step.action === "dither"
          ? document.querySelector('.effect-catalog[data-effect-category="effect"] input')
          : null) ??
        ("action" in step && step.action === "pop"
          ? document.querySelector(".animation-picker")
          : null) ??
        document.querySelector(".canvas-artboard");
      if (target !== observed) {
        if (observed) resize.unobserve(observed);
        if (target) resize.observe(target);
        observed = target;
      }
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
    const mutations = new MutationObserver(schedule);
    mutations.observe(document.body, {
      childList: true,
      subtree: true,
    });
    const stop = engine.subscribe(schedule);
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    measure();
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      mutations.disconnect();
      stop();
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
    };
  }, [step, engine]);
  const width = Math.min(330, viewport.width - 24);
  const x =
    index === 0
      ? (viewport.width - width) / 2
      : Math.max(
          12,
          Math.min(
            viewport.width - width - 12,
            rect.x > viewport.width / 2
              ? rect.x - width - 22
              : rect.x + Math.min(rect.width, 320) + 22,
          ),
        );
  const y =
    index === 0
      ? Math.max(12, (viewport.height - cardHeight) / 2)
      : Math.max(12, Math.min(viewport.height - cardHeight - 12, rect.y + 24));
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
          <MeltLogo size={48} lively />
          <span>
            {index + 1} / {steps.length}
          </span>
          <Button variant="ghost" size="icon-sm" aria-label={copy.exit} onClick={onExit}>
            <X size={16} />
          </Button>
        </header>
        <h2>{step.title}</h2>
        <p ref={text} aria-hidden="true">
          {step.text}
        </p>
        <p className="sr-only" aria-live="polite">
          {step.text}
        </p>
        {error && <p role="alert">{error}</p>}
        <footer>
          <Button variant="ghost" disabled={busy || index === 0} onClick={onPrevious}>
            <ArrowLeft size={14} />
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
