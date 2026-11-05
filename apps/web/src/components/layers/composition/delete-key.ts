import type { KeyboardEvent } from "react";
import { matchBinding } from "../../../state/keybindings/matching";
import { keybindings } from "../../../state/keybindings/store";

/** A virtual composition attachment owns deletion while its controls keep ordinary text editing. */
export function compositionEffectDeleteKey(event: KeyboardEvent<HTMLElement>, remove: () => void) {
  const target = event.target;
  if (
    event.defaultPrevented ||
    event.repeat ||
    matchBinding(event.nativeEvent, keybindings.readSnapshot()) !== "action:delete"
  )
    return;
  if (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      target.closest(
        'input,textarea,select,[role="spinbutton"],[role="slider"],[role="combobox"],[role="listbox"]',
      ))
  )
    return;
  event.preventDefault();
  event.stopPropagation();
  remove();
}
