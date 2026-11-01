import { Speech } from "./Speech";
import { MorphPath } from "../../../ui/brand/morph/MorphPath";
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
      const visible = (selector: string) =>
        Array.from(document.querySelectorAll<HTMLElement>(selector)).find((node) => {
          if (
            node.parentElement?.closest(
              '[hidden],[inert],[aria-hidden="true"],[data-state="closed"]',
            )
          )
            return false;
          const box = node.getBoundingClientRect();
          return (
            box.width > 0 &&
            box.height > 0 &&
            box.bottom > 0 &&
            box.right > 0 &&
            box.x < innerWidth &&
            box.y < innerHeight &&
            getComputedStyle(node).visibility !== "hidden"
          );
        });
      const target =
        visible(step.target) ??
        ("action" in step && step.action === "dither"
          ? visible('.effect-catalog[data-effect-category="effect"] input')
          : null) ??
        ("action" in step && step.action === "pop" ? visible(".animation-picker") : null) ??
        visible(".canvas-artboard");
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
      {index > 0 && "action" in step && rect.width > 0 && (
        <motion.svg
          className="tutorial-pointer"
          aria-hidden="true"
          width="36"
          height="36"
          viewBox="0 0 32 32"
          initial={false}
          animate={{
            x: Math.max(0, Math.min(viewport.width - 36, rect.x - 30)),
            y: Math.max(0, rect.y + rect.height / 2 - 18),
          }}
          transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 300, damping: 28 }}
        >
          <MorphPath
            d={index % 2 ? "M4 3 L27 16 L17 19 L12 29 Z" : "M4 6 L29 16 L17 20 L10 29 Z"}
            fill="var(--primary)"
            stroke="var(--background)"
            strokeWidth={2}
          />
        </motion.svg>
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
