import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useIsPresent, useReducedMotion } from "motion/react";
import type { EnginePort } from "@musart/core";
import { Undo2, Redo2, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useEngineValue } from "../../../state/session/editor";
import { Button } from "../../ui/button";
import { createNoticeTimer } from "../notice-timer";
import { publishNoticeActivity, subscribeNoticeActivity } from "../source";
import { useWorkspaceTheme } from "../../../ui/brand/WorkspaceTheme";
import { workspaceNoticePlacement } from "../../../ui/brand/notice-placement";
import { observeHistoryNotices, type HistoryNoticeValue } from "./source";
import { formatHistoryDescription } from "./presentation";
import "./messages";
import "./history-notice.css";
import "../placement.css";
export function HistoryNotice({ engine }: { engine: EnginePort }) {
  const mode = useWorkspaceTheme();
  const projectId = useEngineValue(engine, (snapshot) => snapshot.project.id);
  const selected = useEngineValue(engine, (snapshot) =>
    snapshot.selection.length === 1 ? snapshot.selection[0] : undefined,
  );
  const [notice, setNotice] = useState<HistoryNoticeValue | null>(null),
    anchor = useRef<HTMLDivElement>(null),
    close = useCallback(() => setNotice(null), [setNotice]);
  const visible = notice !== null;
  useEffect(
    () =>
      observeHistoryNotices(engine, (value) => {
        if (value) publishNoticeActivity(engine, "history");
        setNotice(value);
      }),
    [engine],
  );
  useEffect(
    () =>
      subscribeNoticeActivity(engine, (source) => {
        if (source === "editor") setNotice(null);
      }),
    [engine],
  );
  useLayoutEffect(() => {
    const element = anchor.current,
      workspace = element?.closest<HTMLElement>(".workspace"),
      pill = workspace?.querySelector<HTMLElement>(".project-pill"),
      objectBar = workspace?.querySelector<HTMLElement>(".studio-object-bar-anchor");
    if (!element || !pill || !workspace) return;
    const paint = () => {
      const width = pill.offsetWidth,
        height = pill.offsetHeight,
        barBounds = objectBar?.getBoundingClientRect(),
        workspaceBottom = workspace.getBoundingClientRect().bottom,
        clearBar =
          mode === "studio" && window.innerWidth <= 1200 && barBounds && barBounds.height > 0;
      element.style.setProperty("--history-min-width", `${width}px`);
      element.style.height = `${height}px`;
      if (clearBar)
        element.style.setProperty("--notice-bottom", `${workspaceBottom - barBounds.top + 12}px`);
      else element.style.removeProperty("--notice-bottom");
    };
    paint();
    const resize = new ResizeObserver(paint);
    resize.observe(pill);
    resize.observe(workspace);
    if (objectBar) resize.observe(objectBar);
    window.addEventListener("resize", paint);
    return () => {
      resize.disconnect();
      window.removeEventListener("resize", paint);
    };
  }, [projectId, mode, visible, selected]);
  return (
    <div
      ref={anchor}
      className="history-notice-anchor workspace-notice-anchor"
      data-notice-placement={workspaceNoticePlacement(mode)}
      data-workspace-theme={mode}
      data-canvas-control
    >
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
  const description = formatHistoryDescription(
      notice.description,
      notice.direction,
      t,
      notice.owners,
    ),
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
        {label}
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
