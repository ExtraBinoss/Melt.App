import { isEditingShortcutTarget } from "../../../state/keybindings/matching";
import type { CommandId } from "../../../state/keybindings/model";
import type { PixelSelectionPort } from "./model";

/** Pixel-region intent is resolved before normal layer duplicate/delete shortcuts. */
export function pixelSelectionShortcut(
  event: KeyboardEvent,
  port: PixelSelectionPort | undefined,
  onTask: (task: () => void | Promise<void>) => Promise<boolean>,
  command?: CommandId,
): boolean {
  const state = port?.read();
  if (!state || !port || isEditingShortcutTarget(event.target)) return false;
  const deselect =
      (event.ctrlKey || event.metaKey) &&
      !event.shiftKey &&
      !event.altKey &&
      event.key.toLowerCase() === "d",
    erase = event.key === "Delete" || event.key === "Backspace" || command === "action:delete";
  const copy = command === "action:layerViaCopy" || command === "action:layerViaCut";
  const invert = command === "action:invertSelection";
  if (!deselect && !erase && !copy && !invert && command !== "action:duplicate") return false;
  event.preventDefault();
  if (event.repeat) return true;
  if (deselect) port.deselect();
  else if (copy && !state.busy && !state.dragging && !state.error)
    void onTask(async () => {
      if (port.read() !== state) throw new DOMException("Pixel selection changed.", "AbortError");
      if (command === "action:layerViaCut") await port.cutPixels();
      else await port.copyPixels();
    });
  else if (invert && !state.busy && !state.dragging && !state.error)
    void onTask(async () => {
      if (port.read() !== state) throw new DOMException("Pixel selection changed.", "AbortError");
      await port.invert();
    });
  else if (erase && !state.busy && !state.dragging && !state.error && state.selected > 0)
    void onTask(async () => {
      if (port.read() !== state) throw new DOMException("Pixel selection changed.", "AbortError");
      await port.erase();
    });
  return true;
}
