import type { GuideBox } from "./placement";

export function isGeometryMoving(node: HTMLElement | null) {
  for (let current = node; current; current = current.parentElement) {
    if (
      current.dataset.viewMoving === "true" ||
      current.getAnimations().some((animation) => animation.playState === "running")
    )
      return true;
  }
  return false;
}

/** Radix's positioning wrapper has final layout bounds while content scales/slides in. */
export function measureGuideBox(node: HTMLElement): GuideBox {
  const box = node.getBoundingClientRect();
  const content = node.closest<HTMLElement>(
    '[data-slot="dropdown-menu-content"],[data-slot="dropdown-menu-sub-content"],[data-slot="popover-content"]',
  );
  const wrapper = content?.closest<HTMLElement>("[data-radix-popper-content-wrapper]");
  if (!content || !wrapper) return box;
  const animated = content.getBoundingClientRect();
  const settled = wrapper.getBoundingClientRect();
  if (!animated.width || !animated.height || !settled.width || !settled.height) return box;
  const scaleX = settled.width / animated.width;
  const scaleY = settled.height / animated.height;
  return {
    x: settled.x + (box.x - animated.x) * scaleX,
    y: settled.y + (box.y - animated.y) * scaleY,
    width: box.width * scaleX,
    height: box.height * scaleY,
  };
}

/** Map screen pixels into an overlay, including an entering/scaled export dialog. */
export function relativeGuideBox(
  box: GuideBox,
  frame: GuideBox | undefined,
  width: number,
  height: number,
): GuideBox {
  const scaleX = frame?.width && width ? frame.width / width : 1;
  const scaleY = frame?.height && height ? frame.height / height : 1;
  return {
    x: (box.x - (frame?.x ?? 0)) / scaleX,
    y: (box.y - (frame?.y ?? 0)) / scaleY,
    width: box.width / scaleX,
    height: box.height / scaleY,
  };
}
