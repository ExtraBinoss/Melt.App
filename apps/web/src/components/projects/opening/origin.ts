export interface OpeningPoint {
  x: number;
  y: number;
}
let pointer: OpeningPoint | undefined;

/** A committed library owns these listeners, including its portalled detail dialog. */
export function captureOpeningOrigin(owner: Document): () => void {
  const down = (event: PointerEvent) => {
    if (event.button === 0 && event.isPrimary !== false)
      pointer = { x: event.clientX, y: event.clientY };
  };
  const key = () => {
    pointer = undefined;
  };
  owner.addEventListener("pointerdown", down, true);
  owner.addEventListener("keydown", key, true);
  return () => {
    owner.removeEventListener("pointerdown", down, true);
    owner.removeEventListener("keydown", key, true);
    pointer = undefined;
  };
}

export function openingOrigin(): OpeningPoint {
  const point = pointer;
  pointer = undefined;
  if (point) return point;
  const element = document.activeElement;
  const box = element instanceof HTMLElement ? element.getBoundingClientRect() : null;
  return box?.width && box.height
    ? { x: box.left + box.width / 2, y: box.top + box.height / 2 }
    : { x: innerWidth / 2, y: innerHeight / 2 };
}
