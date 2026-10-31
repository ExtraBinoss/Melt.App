export interface Point {
  x: number;
  y: number;
}
export interface View {
  x: number;
  y: number;
  zoom: number;
}
export const INITIAL_VIEW: View = { x: 0, y: 0, zoom: 1 };
export const MIN_ZOOM = 0.05;
export const MAX_ZOOM = 8;
export const WHEEL_PAN_SPEED = 0.5;
export const WHEEL_ZOOM_GAIN = 0.002;
export const MAX_WHEEL_ZOOM_PIXELS = 80;

export function wheelZoomFactor(delta: number, mode: number, viewport: number): number {
  const pixels = wheelPixels(delta, mode, viewport);
  return Number.isFinite(pixels)
    ? Math.exp(
        -Math.max(-MAX_WHEEL_ZOOM_PIXELS, Math.min(MAX_WHEEL_ZOOM_PIXELS, pixels)) *
          WHEEL_ZOOM_GAIN,
      )
    : 1;
}

/** Travel freely while keeping a useful patch of at least one real artboard in reach. */
export function constrainView(
  view: View,
  size: {
    width: number;
    height: number;
    boards?: readonly { x: number; y: number; width: number; height: number }[];
  },
  viewport: { width: number; height: number },
): View {
  if (viewport.width <= 0 || viewport.height <= 0) return view;
  const boards = size.boards?.length
    ? size.boards
    : [{ x: 0, y: 0, width: size.width, height: size.height }];
  let x = view.x,
    y = view.y,
    distance = Infinity;
  for (const board of boards) {
    const width = board.width * view.zoom,
      height = board.height * view.zoom,
      keepX = Math.min(96, viewport.width * 0.2, width / 2),
      keepY = Math.min(96, viewport.height * 0.2, height / 2),
      limitX = (viewport.width + width) / 2 - keepX,
      limitY = (viewport.height + height) / 2 - keepY,
      centerX = (board.x + board.width / 2 - size.width / 2) * view.zoom,
      centerY = (board.y + board.height / 2 - size.height / 2) * view.zoom,
      nextX = Math.max(-centerX - limitX, Math.min(-centerX + limitX, view.x)),
      nextY = Math.max(-centerY - limitY, Math.min(-centerY + limitY, view.y)),
      nextDistance = (nextX - view.x) ** 2 + (nextY - view.y) ** 2;
    if (nextDistance === 0) return view;
    if (nextDistance < distance) {
      x = nextX;
      y = nextY;
      distance = nextDistance;
    }
  }
  return { ...view, x, y };
}

export function zoomAt(view: View, factor: number, anchor: Point): View {
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, view.zoom * factor));
  const ratio = zoom / view.zoom;
  return {
    x: anchor.x - (anchor.x - view.x) * ratio,
    y: anchor.y - (anchor.y - view.y) * ratio,
    zoom,
  };
}

export function pan(view: View, deltaX: number, deltaY: number): View {
  return { ...view, x: view.x - deltaX, y: view.y - deltaY };
}

export function clientToPage(
  client: Point,
  rect: Pick<DOMRect, "left" | "top" | "width" | "height">,
  view: View,
  size: { width: number; height: number },
): Point {
  return {
    x: (client.x - rect.left - rect.width / 2 - view.x) / view.zoom + size.width / 2,
    y: (client.y - rect.top - rect.height / 2 - view.y) / view.zoom + size.height / 2,
  };
}

export function wheelPixels(delta: number, mode: number, viewport: number): number {
  return delta * (mode === 1 ? 16 : mode === 2 ? viewport : 1);
}

export function fitView(
  size: { width: number; height: number },
  viewport: { width: number; height: number },
): View {
  return {
    x: 0,
    y: 0,
    zoom: Math.min(
      1,
      Math.max(
        MIN_ZOOM,
        Math.min((viewport.width - 160) / size.width, (viewport.height - 160) / size.height),
      ),
    ),
  };
}
