import { useLayoutEffect, useRef, useState } from "react";
import type { SelectOption } from "../../shared/SelectField";

/** Keep native form reset/autofill without mounting an option tree for standalone fields. */
export function FieldFormValue({
  identity,
  value,
  options,
  onValueChange,
}: {
  identity: object;
  value: string;
  options: readonly SelectOption[];
  onValueChange: (value: string) => void;
}) {
  const anchor = useRef<HTMLSpanElement>(null);
  const [inForm, setInForm] = useState(false);
  const current = useRef({ identity, value, onValueChange });
  const initial = useRef({ identity, value });
  useLayoutEffect(() => {
    current.current = { identity, value, onValueChange };
    if (initial.current.identity !== identity) initial.current = { identity, value };
  }, [identity, value, onValueChange]);
  useLayoutEffect(() => {
    const form = anchor.current?.closest("form");
    if (!form) return;
    setInForm(true);
    const reset = () => current.current.onValueChange(initial.current.value);
    form.addEventListener("reset", reset);
    return () => form.removeEventListener("reset", reset);
  }, []);
  return (
    <span ref={anchor} hidden aria-hidden="true">
      {inForm && (
        <select tabIndex={-1} value={value} onChange={(event) => onValueChange(event.target.value)}>
          {value === "" && <option value="" />}
          {options.map((option) => (
            <option key={option.value} value={option.value} disabled={option.disabled}>
              {typeof option.label === "string" ? option.label : option.value}
            </option>
          ))}
        </select>
      )}
    </span>
  );
}
