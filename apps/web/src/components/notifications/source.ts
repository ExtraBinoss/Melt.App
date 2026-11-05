import type { EnginePort } from "@musart/core";
import type { EditorNoticeValue } from "./EditorNotice";

type NoticeListener = (notice: EditorNoticeValue) => void;
type ActivityListener = (source: "editor" | "history") => void;
const notices = new WeakMap<EnginePort, Set<NoticeListener>>(),
  activities = new WeakMap<EnginePort, Set<ActivityListener>>();

/** UI feedback belongs to its editor session, never to the portable document. */
export function publishEditorNotice(engine: EnginePort, notice: EditorNoticeValue): void {
  for (const listener of notices.get(engine) ?? []) listener(notice);
}
export function subscribeEditorNotices(engine: EnginePort, listener: NoticeListener): () => void {
  const listeners = notices.get(engine) ?? new Set<NoticeListener>();
  notices.set(engine, listeners);
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (!listeners.size) notices.delete(engine);
  };
}

/** One visible feedback slot prevents a success/error card from covering undo feedback. */
export function publishNoticeActivity(engine: EnginePort, source: "editor" | "history"): void {
  for (const listener of activities.get(engine) ?? []) listener(source);
}
export function subscribeNoticeActivity(
  engine: EnginePort,
  listener: ActivityListener,
): () => void {
  const listeners = activities.get(engine) ?? new Set<ActivityListener>();
  activities.set(engine, listeners);
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (!listeners.size) activities.delete(engine);
  };
}
