import { clientToPage, type Point } from "../viewport/view";
import type { ViewSource } from "../viewport/motion";
import { createLayerGeometryIndex, LayerGeometryIndex, type Composition } from "@musart/core";
interface Frame {
  readonly page: Composition;
}
interface Source {
  read(): Frame;
}
const frames = new WeakMap<Frame, LayerGeometryIndex>();
const sources = new WeakMap<Source, { page: Composition; index: LayerGeometryIndex }>();

/** Presented frames are immutable for their lifetime, even when their portable page is
 * not frozen. Cache only under that explicit frame contract, never arbitrary drafts. */
export function frameGeometry(frame: Frame, previous?: LayerGeometryIndex): LayerGeometryIndex {
  let index = frames.get(frame);
  if (!index) {
    index = Object.isFrozen(frame.page)
      ? createLayerGeometryIndex(frame.page)
      : new LayerGeometryIndex(frame.page, previous?.query);
    frames.set(frame, index);
  }
  return index;
}
export function sourceGeometry(source: Source): LayerGeometryIndex {
  const frame = source.read(),
    previous = sources.get(source);
  if (previous?.page === frame.page) return previous.index;
  const index = frameGeometry(frame, previous?.index);
  sources.set(source, { page: frame.page, index });
  return index;
}

/** Convert input only inside its handler; never inspect a React ref during render. */
export function sourcePagePoint(
  source: Source,
  viewport: HTMLElement,
  view: ViewSource,
  event: { clientX: number; clientY: number },
): Point {
  return clientToPage(
    { x: event.clientX, y: event.clientY },
    viewport.getBoundingClientRect(),
    view.read(),
    source.read().page,
  );
}
