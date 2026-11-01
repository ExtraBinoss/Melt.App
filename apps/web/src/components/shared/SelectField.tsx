import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { FieldFormValue } from "../ui/select/form-value";
import { FieldMenu, FieldMenuOption } from "../ui/select/field-menu";
import { getUiPresentation } from "../../state/session/ui-presentation";
export interface SelectOption {
  value: string;
  label: ReactNode;
  disabled?: boolean;
}
export type SelectFieldIdentity = object | string | number | symbol | null;
/** Accessible Radix listbox, with optional imperative hover/focus drafts separate from selection. */
export function SelectField({
  label,
  value,
  options,
  onValueChange,
  onPreview,
  onPreviewCancel,
  id,
  disabled,
  className,
  contentClassName,
  side,
  selectedLabel,
  identity,
  scrollButtons: _scrollButtons,
  contentAttributes,
}: {
  label: string;
  value: string;
  options: readonly SelectOption[];
  onValueChange: (value: string) => void;
  onPreview?: (value: string) => void;
  onPreviewCancel?: () => void;
  id?: string;
  disabled?: boolean;
  className?: string;
  contentClassName?: string;
  side?: "top" | "right" | "bottom" | "left";
  selectedLabel?: ReactNode;
  identity?: SelectFieldIdentity;
  scrollButtons?: boolean;
  contentAttributes?: Record<`data-${string}`, string | boolean | undefined>;
}) {
  const [owner, setOwner] = useState(() => ({ identity, token: {} }));
  const current = useRef<object | null>(owner.token);
  const openingOwner = useRef(owner.token);
  const session = useRef<{
    owner: object;
    open: boolean;
    last: string | null;
    cancel?: () => void;
  }>({ owner: owner.token, open: false, last: null });
  const labels = useRef(new Map<string, string>());
  const search = useRef({ value: "", at: 0 });
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  if (!Object.is(owner.identity, identity)) {
    setOwner({ identity, token: {} });
    setMounted(false);
    setOpen(false);
  }
  if (disabled && open) setOpen(false);
  useLayoutEffect(() => {
    const values = new Set(options.map((option) => option.value));
    for (const key of labels.current.keys()) if (!values.has(key)) labels.current.delete(key);
  }, [options]);
  useLayoutEffect(() => {
    search.current = { value: "", at: 0 };
    current.current = owner.token;
    const previous = session.current;
    if (previous.owner !== owner.token) {
      session.current = { owner: owner.token, open: false, last: null };
      if (previous.open) previous.cancel?.();
    }
    return () => {
      if (current.current === owner.token) current.current = null;
    };
  }, [owner.token]);
  useLayoutEffect(() => {
    if (session.current.owner === owner.token && session.current.open)
      session.current.cancel = onPreviewCancel;
  }, [owner.token, onPreviewCancel]);
  useEffect(
    () => () => {
      if (session.current.open) session.current.cancel?.();
    },
    [],
  );
  useLayoutEffect(() => {
    if (disabled && session.current.open) {
      session.current.open = false;
      session.current.last = null;
      session.current.cancel?.();
    }
  }, [disabled]);
  useLayoutEffect(() => {
    if (open && !disabled) return getUiPresentation().hold();
  }, [open, disabled]);
  function owned() {
    return !disabled && current.current === owner.token;
  }
  function guardItem(event: { preventDefault(): void }) {
    if (!owned() || session.current.owner !== owner.token || !session.current.open)
      event.preventDefault();
  }
  function preview(option: SelectOption) {
    if (
      !owned() ||
      option.disabled ||
      session.current.owner !== owner.token ||
      !session.current.open ||
      session.current.last === option.value
    )
      return;
    session.current.last = option.value;
    onPreview?.(option.value);
  }
  const selected =
    value === ""
      ? ""
      : (selectedLabel ?? options.find((option) => option.value === value)?.label ?? value);
  return (
    <>
      <FieldMenu
        id={id}
        label={label}
        className={className}
        contentClassName={["property-select-menu", contentClassName].filter(Boolean).join(" ")}
        side={side}
        contentAttributes={contentAttributes}
        trigger={selected}
        value={value}
        open={open && !disabled}
        disabled={disabled}
        onFocus={() => {
          if (owned()) setMounted(true);
        }}
        onKeyDown={(event) => {
          if (open || !owned()) return;
          if (event.key === "ArrowUp") {
            event.preventDefault();
            event.currentTarget.click();
            return;
          }
          if (
            event.key.length !== 1 ||
            event.key === " " ||
            event.ctrlKey ||
            event.metaKey ||
            event.altKey
          )
            return;
          const at = event.timeStamp,
            previous = search.current;
          const text = at - previous.at < 1000 ? previous.value + event.key : event.key;
          search.current = { value: text, at };
          const query = text === event.key.repeat(text.length) ? event.key : text;
          const start = options.findIndex((option) => option.value === value);
          const ordered = [...options.slice(start + 1), ...options.slice(0, start + 1)];
          const next = ordered.find(
            (option) =>
              !option.disabled &&
              (
                labels.current.get(option.value) ??
                (typeof option.label === "string" ? option.label : option.value)
              )
                .toLocaleLowerCase()
                .startsWith(query.toLocaleLowerCase()),
          );
          if (next) {
            event.preventDefault();
            onValueChange(next.value);
          }
        }}
        onCloseAutoFocus={(event) => {
          if (session.current.open || current.current !== openingOwner.current)
            event.preventDefault();
        }}
        onOpenChange={(open) => {
          if (!owned()) return;
          setOpen(open && !disabled);
          if (open && !disabled) {
            openingOwner.current = owner.token;
            setMounted(true);
            session.current.open = true;
            session.current.last = value;
            session.current.cancel = onPreviewCancel;
          } else if (session.current.open) {
            session.current.open = false;
            session.current.last = null;
            session.current.cancel?.();
          }
        }}
        onValueChange={(next) => {
          if (owned() && options.some((option) => option.value === next && !option.disabled))
            onValueChange(next);
        }}
      >
        {options.map((option) => (
          <FieldMenuOption
            key={option.value}
            value={option.value}
            selected={option.value === value}
            disabled={option.disabled}
            onPointerMove={() => preview(option)}
            onFocus={() => preview(option)}
            onClick={guardItem}
            onPointerUp={guardItem}
            onKeyDown={guardItem}
          >
            {option.label}
          </FieldMenuOption>
        ))}
      </FieldMenu>
      <FieldFormValue
        identity={owner.token}
        value={value}
        options={options}
        onValueChange={onValueChange}
      />
      {mounted && !open && (
        <div hidden aria-hidden="true">
          {options.map((option) => (
            <span
              key={option.value}
              ref={(node) => {
                if (node) labels.current.set(option.value, node.textContent ?? option.value);
              }}
            >
              {option.label}
            </span>
          ))}
        </div>
      )}
    </>
  );
}
