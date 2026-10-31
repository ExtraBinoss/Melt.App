import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useIsPresent, useReducedMotion } from "motion/react";
import type { EnginePort } from "@musart/core";
import { Undo2, Redo2, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useEngineValue } from "../../../state/session/editor";
import { Button } from "../../ui/button";
import { createNoticeTimer } from "../notice-timer";
import { observeHistoryNotices, type HistoryNoticeValue } from "./source";
import "./messages";
import "./history-notice.css";
export function HistoryNotice({ engine }: { engine: EnginePort }) {
  const projectId = useEngineValue(engine, (snapshot) => snapshot.project.id);
  const [notice, setNotice] = useState<HistoryNoticeValue | null>(null),
    anchor = useRef<HTMLDivElement>(null),
    close = useCallback(() => setNotice(null), [setNotice]);
  useEffect(() => observeHistoryNotices(engine, setNotice), [engine, setNotice]);
  useLayoutEffect(() => {
    const element = anchor.current,
      pill = element?.closest(".workspace")?.querySelector<HTMLElement>(".project-pill");
    if (!element || !pill) return;
    const paint = () => {
      const width = pill.offsetWidth,
        height = pill.offsetHeight;
      element.style.width = `${width}px`;
      element.style.height = `${height}px`;
    };
    paint();
    const resize = new ResizeObserver(paint);
    resize.observe(pill);
    return () => resize.disconnect();
  }, [projectId]);
  return (
    <div ref={anchor} className="history-notice-anchor" data-canvas-control>
      <AnimatePresence>
        {notice && <HistoryCard key="history" notice={notice} onClose={close} />}
      </AnimatePresence>
    </div>
  );
}
function HistoryCard({ notice, onClose }: { notice: HistoryNoticeValue; onClose: () => void }) {
  const { t } = useTranslation("historyNotice"),
    present = useIsPresent(),
    reduced = useReducedMotion();
  const [timer] = useState(() => createNoticeTimer(onClose));
  useLayoutEffect(() => {
    timer.setOnExpire(onClose);
  }, [onClose, timer]);
  useLayoutEffect(() => {
    if (present) timer.restart(2000);
    else timer.clear();
    return () => timer.clear();
  }, [notice.id, present, timer]);
  useLayoutEffect(() => () => timer.dispose(), [timer]);
  const value = notice.direction === "undo" ? notice.before : notice.after,
    description = `${t(notice.action)}${value ? ` ${value}` : ""}`,
    label = `${t(notice.direction)} · ${description}`,
    Icon = notice.direction === "undo" ? Undo2 : Redo2;
  return (
    <motion.div
      className="history-notice floating-panel"
      role="status"
      aria-label={label}
      aria-atomic="true"
      data-history-direction={notice.direction}
      inert={!present || undefined}
      aria-hidden={!present || undefined}
      initial={reduced ? false : { opacity: 0, y: -6, scale: 0.94 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: reduced ? 0 : -6, scale: reduced ? 1 : 0.96 }}
      transition={{ duration: reduced ? 0 : 0.16 }}
      onPointerEnter={() => timer.pause("hover", true)}
      onPointerLeave={() => timer.pause("hover", false)}
      onFocusCapture={() => timer.pause("focus", true)}
      onBlurCapture={(event) => {
        if (
          !(event.relatedTarget instanceof Node) ||
          !event.currentTarget.contains(event.relatedTarget)
        )
          timer.pause("focus", false);
      }}
    >
      <Icon size={15} aria-hidden />
      <span dir="auto" title={label}>
        {description}
      </span>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={t("close")}
        onClick={() => {
          timer.clear();
          onClose();
        }}
      >
        <X size={12} />
      </Button>
    </motion.div>
  );
}
