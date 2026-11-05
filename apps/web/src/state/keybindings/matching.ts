import { chordKey, eventChord } from "./chords";
import type { BindingSnapshot, CommandId } from "./model";
const indexes = new WeakMap<BindingSnapshot, ReadonlyMap<string, CommandId>>();

export function matchBinding(
  event: KeyboardEvent,
  snapshot: BindingSnapshot,
): CommandId | undefined {
  const chord = eventChord(event);
  if (!chord) return;
  let index = indexes.get(snapshot);
  if (!index) {
    index = new Map(
      [...snapshot.bindings].flatMap(([command, values]) =>
        values.map((value) => [chordKey(value), command] as const),
      ),
    );
    indexes.set(snapshot, index);
  }
  return index.get(chordKey(chord));
}
export function isEditingShortcutTarget(
  target: EventTarget | null,
  options: { documentScope?: boolean } = {},
): boolean {
  // Opted-in document controls may live in a nonmodal property popover.
  // Explicit dialogs and editable fields retain their own keyboard ownership.
  const dialog = options.documentScope
    ? '[role="dialog"]:not([data-slot="popover-content"]),[role="dialog"][aria-modal="true"]'
    : '[role="dialog"]';
  const editing = `input,textarea,select,[contenteditable="true"],${dialog},[role="alertdialog"],[role="combobox"],[role="listbox"],[role="menu"]`;
  const widgets = ',[role="slider"],[role="spinbutton"],[data-keybinding-capture]';
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || !!target.closest(editing + (options.documentScope ? "" : widgets)))
  );
}
