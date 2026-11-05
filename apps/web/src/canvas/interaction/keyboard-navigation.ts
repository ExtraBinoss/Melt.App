import type { KeyboardEvent } from "react";

/** Keep editor navigation out of embedded fields and local control surfaces. */
export function canvasNavigationKeyDown(
  event: KeyboardEvent<HTMLDivElement>,
  setSpace: (held: boolean) => void,
) {
  if ((event.target as HTMLElement).closest("[data-canvas-control]")) return false;
  if (event.code === "Space" && !event.ctrlKey && !event.metaKey && !event.altKey) {
    event.preventDefault();
    setSpace(true);
  }
  return event.key === "Escape";
}

export function canvasNavigationKeys(setSpace: (held: boolean) => void) {
  return {
    onKeyUp(event: KeyboardEvent<HTMLDivElement>) {
      if (event.code === "Space") setSpace(false);
    },
    onBlur() {
      setSpace(false);
    },
  };
}
