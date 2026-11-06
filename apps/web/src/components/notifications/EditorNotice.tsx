import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { EnginePort } from "@musart/core";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useIsPresent, useReducedMotion } from "motion/react";
import { AlertCircle, CheckCircle2, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "../ui/button";
import { CopyButton } from "../ui/copy-button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/tooltip";
import { createNoticeTimer } from "./notice-timer";
import { useWorkspaceTheme } from "../../ui/brand/WorkspaceTheme";
import { workspaceNoticePlacement } from "../../ui/brand/notice-placement";
import { publishNoticeActivity, subscribeNoticeActivity } from "./source";
import { useNoticeAnchor } from "./use-notice-anchor";
import "./messages";
import "./notices.css";
import "./placement.css";

export interface EditorNoticeValue {
  title?: string;
  message: string;
  error: boolean;
  details?: string;
}
export const SUCCESS_NOTICE_MS = 4000,
  ERROR_NOTICE_MS = 8000;

/** A single accessible notice. Its timers/copy feedback are isolated from editor renders. */
export function EditorNotice({
  notice,
  onClose,
  engine,
}: {
  notice: EditorNoticeValue | null;
  onClose: () => void;
  engine?: EnginePort;
}) {
  const mode = useWorkspaceTheme(),
    placement = workspaceNoticePlacement(mode),
    anchor = useRef<HTMLDivElement>(null);
  useNoticeAnchor(anchor, Boolean(notice), placement);
  useEffect(() => {
    if (engine && notice) publishNoticeActivity(engine, "editor");
  }, [engine, notice]);
  useEffect(() => {
    if (!engine) return;
    return subscribeNoticeActivity(engine, (source) => {
      if (source === "history") onClose();
    });
  }, [engine, onClose]);
  return createPortal(
    <div
      ref={anchor}
      className="editor-notice-anchor workspace-notice-anchor"
      data-workspace-theme={mode}
      data-notice-placement={placement}
    >
      <AnimatePresence>
        {notice && <NoticeCard key="notice" notice={notice} onClose={onClose} />}
      </AnimatePresence>
    </div>,
    document.body,
  );
}
export function NoticeCard({
  notice,
  onClose,
  paused = false,
  animated = true,
  active = true,
}: {
  notice: EditorNoticeValue;
  onClose: () => void;
  paused?: boolean;
  animated?: boolean;
  active?: boolean;
}) {
  const { t } = useTranslation("notices");
  const retained = useIsPresent(),
    present = retained && active,
    reduced = useReducedMotion();
  const [timer] = useState(() => createNoticeTimer(onClose));
  useLayoutEffect(() => {
    timer.setOnExpire(onClose);
  }, [onClose, timer]);
  useLayoutEffect(() => {
    if (present) timer.restart(notice.error ? ERROR_NOTICE_MS : SUCCESS_NOTICE_MS);
    else timer.clear();
    return () => timer.clear();
  }, [notice.title, notice.message, notice.error, notice.details, present, timer]);
  useLayoutEffect(() => () => timer.dispose(), [timer]);
  useLayoutEffect(() => {
    timer.pause("stack", paused);
  }, [timer, paused]);
  const copying = useCallback((active: boolean) => timer.pause("copy", active), [timer]);
  const dismiss = () => {
    timer.clear();
    onClose();
  };
  const message = notice.title ? `${notice.title}\n${notice.message}` : notice.message;
  const copyText = notice.details ? `${message}\n\n${t("details")}:\n${notice.details}` : message;
  return (
    <motion.div
      className={`editor-notice notice-card floating-panel ${notice.error ? "error-notice" : ""}`}
      role={notice.error ? "alert" : "status"}
      aria-atomic="true"
      inert={!present || undefined}
      aria-hidden={!present || undefined}
      initial={reduced || !animated ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: reduced ? 0 : 8 }}
      transition={{ duration: reduced ? 0 : 0.14 }}
      style={{ pointerEvents: present ? "auto" : "none" }}
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
      {notice.error ? (
        <AlertCircle size={18} aria-hidden />
      ) : (
        <CheckCircle2 size={18} aria-hidden />
      )}
      <div className="notice-content">
        {notice.title && <strong className="notice-title">{notice.title}</strong>}
        <p>{notice.message}</p>
        {notice.details && (
          <details>
            <summary>{t("details")}</summary>
            <pre>{notice.details}</pre>
          </details>
        )}
      </div>
      <div className="notice-actions">
        <CopyButton text={copyText} label={t("copy")} onCopyingChange={copying} />
        <TooltipProvider delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="icon-xs" variant="ghost" aria-label={t("close")} onClick={dismiss}>
                <X size={14} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t("close")}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </motion.div>
  );
}
