import { useId, useLayoutEffect, useRef, useState } from "react";
import { Input } from "../../ui/input";
import { InfoTooltip } from "../../shared/InfoTooltip";
/** Local text draft; publish valid previews and commit once on Enter/blur. */
export function EffectText({
  identity,
  label,
  value,
  minLength,
  maxLength,
  hint,
  disabled,
  onStart,
  onPreview,
  onCommit,
  onCancel,
}: {
  identity: object;
  label: string;
  value: string;
  minLength: number;
  maxLength: number;
  hint?: string;
  disabled?: boolean;
  onStart?: () => void;
  onPreview: (value: string) => void;
  onCommit: (value: string) => void;
  onCancel?: () => void;
}) {
  const id = useId();
  const [draft, setDraft] = useState({ identity, value, editing: false });
  const owner = useRef<object | null>(null),
    active = useRef(false),
    original = useRef(value),
    cancel = useRef(onCancel);
  if (draft.identity !== identity) setDraft({ identity, value, editing: false });
  useLayoutEffect(() => {
    cancel.current = onCancel;
  }, [onCancel]);
  useLayoutEffect(() => {
    owner.current = identity;
    return () => {
      owner.current = null;
      if (active.current) {
        active.current = false;
        cancel.current?.();
      }
    };
  }, [identity]);
  function begin() {
    if (disabled || owner.current !== identity || active.current) return;
    active.current = true;
    original.current = value;
    onStart?.();
  }
  function valid(next: string) {
    return next.length >= minLength && next.length <= maxLength;
  }
  function finish(next: string, commit: boolean) {
    if (!active.current || owner.current !== identity) return;
    active.current = false;
    setDraft({ identity, value, editing: false });
    if (commit && valid(next) && next !== original.current) onCommit(next);
    else onCancel?.();
  }
  return (
    <div className="effect-text-field">
      <span className="effect-text-label">
        <label htmlFor={id}>{label}</label>
        {hint && <InfoTooltip label={label}>{hint}</InfoTooltip>}
      </span>
      <Input
        id={id}
        aria-label={label}
        disabled={disabled}
        value={draft.identity === identity && draft.editing ? draft.value : value}
        minLength={minLength}
        maxLength={maxLength}
        spellCheck={false}
        autoComplete="off"
        onFocus={begin}
        onChange={(event) => {
          if (disabled || owner.current !== identity) return;
          begin();
          const next = event.target.value;
          setDraft({ identity, value: next, editing: true });
          if (valid(next)) onPreview(next);
        }}
        onBlur={(event) => finish(event.currentTarget.value, true)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            finish(value, false);
          } else if (event.key === "Enter") {
            event.preventDefault();
            event.stopPropagation();
            event.currentTarget.blur();
          }
        }}
      />
    </div>
  );
}
