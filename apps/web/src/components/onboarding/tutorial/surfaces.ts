/** Closed tooltip triggers are visible controls; only closed overlay contents are excluded. */
export const CLOSED_SURFACE =
  '[role="menu"][data-state="closed"],[role="dialog"][data-state="closed"],[data-slot="popover-content"][data-state="closed"]';
export function visible<T extends HTMLElement = HTMLElement>(
  selector: string,
  inViewport = false,
): T | undefined {
  return Array.from(document.querySelectorAll<T>(selector)).find((node) => {
    if (node.closest('[hidden],[inert],[aria-hidden="true"]') || node.closest(CLOSED_SURFACE))
      return false;
    const box = node.getBoundingClientRect();
    if (box.width <= 0 || box.height <= 0 || getComputedStyle(node).visibility === "hidden")
      return false;
    return (
      !inViewport || (box.bottom > 0 && box.right > 0 && box.x < innerWidth && box.y < innerHeight)
    );
  });
}
