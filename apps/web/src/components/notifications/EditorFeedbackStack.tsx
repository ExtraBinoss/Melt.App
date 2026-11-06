import { useCallback, useEffect, useId, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { atom, useAtomValue, useSetAtom } from "jotai";
import type { Atom } from "jotai";
import type { EnginePort } from "@musart/core";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { Toaster } from "../ui/sonner";
import { NoticeCard, type EditorNoticeValue } from "./EditorNotice";
import { HistoryCard } from "./history/HistoryNotice";
import { observeHistoryNotices, type HistoryNoticeValue } from "./history/source";
import { subscribeEditorNotices } from "./source";
import { useWorkspaceTheme } from "../../ui/brand/WorkspaceTheme";
import { workspaceNoticePlacement } from "../../ui/brand/notice-placement";
import { useNoticeAnchor } from "./use-notice-anchor";
import "./stack.css";

export const MAX_EDITOR_NOTICES = 5;
type Feedback =
  | { kind: "editor"; value: EditorNoticeValue }
  | { kind: "history"; value: HistoryNoticeValue };
type Entry = Feedback & { id: string };

/** One bounded, session-local queue. Only the stack subscribes; feedback never rerenders App. */
export function EditorFeedbackStack({ engine }: { engine: EnginePort }) {
  const host = useId();
  const sequence = useRef(0),
    anchor = useRef<HTMLDivElement>(null);
  const state = useMemo(() => {
    const interaction = atom({ hover: false, focus: false });
    return {
      entries: atom<Entry[]>([]),
      interaction,
      paused: atom((get) => get(interaction).hover || get(interaction).focus),
      focused: atom((get) => get(interaction).focus),
    };
  }, []);
  const entries = useAtomValue(state.entries),
    focused = useAtomValue(state.focused);
  const update = useSetAtom(state.entries),
    interact = useSetAtom(state.interaction);
  const mode = useWorkspaceTheme(),
    placement = workspaceNoticePlacement(mode);
  const { t, i18n } = useTranslation("notices");
  useNoticeAnchor(anchor, entries.length > 0, placement);
  const dismiss = useCallback(
    (id: string) => {
      update((current) => current.filter((item) => item.id !== id));
    },
    [update],
  );
  useEffect(() => {
    const push = (feedback: Feedback) => {
      const id = `${host}-${++sequence.current}`;
      update((current) => {
        const latest = current.at(-1);
        if (
          feedback.kind === "editor" &&
          feedback.value.error &&
          latest?.kind === "editor" &&
          latest.value.error &&
          latest.value.message === feedback.value.message &&
          latest.value.details === feedback.value.details
        )
          return current;
        return [...current.slice(-(MAX_EDITOR_NOTICES - 1)), { ...feedback, id }];
      });
    };
    const stopEditor = subscribeEditorNotices(engine, (value) => push({ kind: "editor", value }));
    const stopHistory = observeHistoryNotices(engine, (value) => {
      if (value) push({ kind: "history", value });
      else update([]);
    });
    return () => {
      stopEditor();
      stopHistory();
      update([]);
    };
  }, [engine, host, update]);
  const registered = useRef(new Set<string>());
  useEffect(() => {
    const active = new Set(entries.map((item) => item.id));
    for (const id of registered.current) if (!active.has(id)) toast.dismiss(id);
    for (const entry of entries) {
      if (registered.current.has(entry.id)) continue;
      toast.custom(
        () => (
          <StackCard
            entry={entry}
            entries={state.entries}
            paused={state.paused}
            onClose={() => dismiss(entry.id)}
          />
        ),
        { id: entry.id, toasterId: host, duration: Infinity, onDismiss: () => dismiss(entry.id) },
      );
    }
    registered.current = active;
  }, [entries, host, state.entries, state.paused, dismiss]);
  useEffect(() => {
    return () => {
      for (const id of registered.current) toast.dismiss(id);
    };
  }, []);
  return createPortal(
    <div
      ref={anchor}
      className="editor-notice-anchor workspace-notice-anchor editor-feedback-stack"
      data-workspace-theme={mode}
      data-notice-placement={placement}
      onPointerEnter={() => interact((value) => ({ ...value, hover: true }))}
      onPointerLeave={() => interact((value) => ({ ...value, hover: false }))}
      onFocusCapture={() => interact((value) => ({ ...value, focus: true }))}
      onBlurCapture={(event) => {
        if (
          !(event.relatedTarget instanceof Node) ||
          !event.currentTarget.contains(event.relatedTarget)
        )
          interact((value) => ({ ...value, focus: false }));
      }}
    >
      <Toaster
        id={host}
        position={placement}
        dir={i18n.dir()}
        customAriaLabel={t("notifications")}
        visibleToasts={MAX_EDITOR_NOTICES}
        expand={focused}
        gap={10}
        offset={0}
        mobileOffset={0}
      />
    </div>,
    document.body,
  );
}

function StackCard({
  entry,
  entries,
  paused,
  onClose,
}: {
  entry: Entry;
  entries: Atom<Entry[]>;
  paused: Atom<boolean>;
  onClose: () => void;
}) {
  const presence = useMemo(
    () => atom((get) => get(entries).some((item) => item.id === entry.id)),
    [entries, entry.id],
  );
  const active = useAtomValue(presence);
  const held = useAtomValue(paused);
  return entry.kind === "editor" ? (
    <NoticeCard
      notice={entry.value}
      onClose={onClose}
      paused={held}
      animated={false}
      active={active}
    />
  ) : (
    <HistoryCard
      notice={entry.value}
      onClose={onClose}
      paused={held}
      animated={false}
      active={active}
    />
  );
}
