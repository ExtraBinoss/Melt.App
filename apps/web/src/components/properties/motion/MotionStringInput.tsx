import {
  useEffect,
  useLayoutEffect,
  useRef,
  type ChangeEvent,
  type KeyboardEvent,
  type FocusEvent,
} from "react";
import { resolveMotionProperty, type EnginePort, type MotionPropertyTarget } from "@musart/core";
import { createMotionTransport } from "../../../services/motion/transport";
import { motionTimeChanges } from "../../../state/session/motion-edit";
import { Input } from "../../ui/input";
import { Textarea } from "../../ui/textarea";

/** One native draft, restored on seek even if a discrete property keeps the same value. */
export function MotionStringInput({
  engine,
  target,
  value,
  label,
  disabled,
  multiline = false,
  coalescePreview = false,
  validate,
  onPreview,
  onCommit,
  onCancel,
}: {
  engine?: EnginePort;
  target: MotionPropertyTarget;
  value: string;
  label: string;
  disabled?: boolean;
  multiline?: boolean;
  coalescePreview?: boolean;
  validate?: (value: string) => boolean;
  onPreview?: (value: string) => void;
  onCommit(this: void, value: string): void;
  onCancel(this: void): void;
}) {
  const field = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const committed = useRef(value),
    dirty = useRef(false),
    cancel = useRef(onCancel);
  const pending = useRef<{ frame: number; value: string } | null>(null);
  const preview = useRef(onPreview);
  useLayoutEffect(() => {
    preview.current = onPreview;
  });
  function clearPending() {
    if (pending.current) cancelAnimationFrame(pending.current.frame);
    pending.current = null;
  }
  useLayoutEffect(
    () => () => {
      clearPending();
      if (dirty.current) cancel.current();
    },
    [],
  );
  useLayoutEffect(() => {
    cancel.current = onCancel;
  }, [onCancel]);
  useLayoutEffect(() => {
    clearPending();
    committed.current = value;
    if (field.current) field.current.value = value;
    if (dirty.current) {
      dirty.current = false;
      cancel.current();
    }
  }, [value]);
  useEffect(() => {
    if (!engine) return;
    return motionTimeChanges(engine).subscribe(() => {
      clearPending();
      if (!dirty.current) return;
      dirty.current = false;
      if (field.current) field.current.value = committed.current;
      cancel.current();
    });
  }, [engine]);
  const props = {
    ref: (element: HTMLInputElement | HTMLTextAreaElement | null) => {
      field.current = element;
    },
    "aria-label": label,
    disabled,
    defaultValue: value,
    onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      dirty.current = true;
      const next = event.currentTarget.value;
      if (validate && !validate(next)) {
        clearPending();
        onCancel();
      } else if (!coalescePreview) onPreview?.(next);
      else if (pending.current) pending.current.value = next;
      else {
        const frame = requestAnimationFrame(() => {
          const next = pending.current;
          pending.current = null;
          if (next && dirty.current) preview.current?.(next.value);
        });
        pending.current = { frame, value: next };
      }
    },
    onKeyDown: (event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (event.key === "Enter" && !multiline) event.currentTarget.blur();
      if (event.key === "Escape") {
        event.preventDefault();
        clearPending();
        dirty.current = false;
        event.currentTarget.value = committed.current;
        onCancel();
        event.currentTarget.blur();
      }
    },
    onBlur: (event: FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      clearPending();
      dirty.current = false;
      const next = event.currentTarget.value;
      if ((!validate || validate(next)) && next !== committed.current) {
        if (!engine) committed.current = next;
        onCommit(next);
      } else onCancel();
      if (engine) {
        const snapshot = engine.getSnapshot();
        const page =
          createMotionTransport(engine).readFrame() ??
          snapshot.project.pages.find((page) => page.id === snapshot.pageId)!;
        const actual = resolveMotionProperty(page, target)?.value;
        if (typeof actual === "string") committed.current = actual;
      }
      if (field.current) field.current.value = committed.current;
    },
  };
  return multiline ? <Textarea {...props} rows={3} /> : <Input {...props} />;
}
