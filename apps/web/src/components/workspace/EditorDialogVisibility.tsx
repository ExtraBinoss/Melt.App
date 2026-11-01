import { cloneElement, type ReactElement } from "react";
import { useAtomValue, type Atom } from "jotai";

export interface EditorDialogs {
  exportOpen: boolean;
  timelapseOpen: boolean;
}
/** Only the modal owner observes visibility; the workspace and its nested tools stay unchanged. */
export function EditorDialogVisibility({
  state,
  children,
}: {
  state: Atom<EditorDialogs>;
  children: ReactElement<EditorDialogs>;
}) {
  return cloneElement(children, useAtomValue(state));
}
