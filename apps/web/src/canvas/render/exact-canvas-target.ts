import { CanvasTarget, Vector2, type WebGPURenderer } from "three/webgpu";

/** R3F owns CSS/DPR intent; acknowledged composition frames own physical texels.
 * Keep native getters, viewport and backend state at the actual physical size/DPR1.
 */
export class ExactCanvasTarget extends CanvasTarget {
  private readonly size = new Vector2();
  private closed = false;
  override setPixelRatio(_value = 1): void {
    // Fiber retains this intent in viewport.dpr and DrawingDensity.bounds.
    // Applying it to the previous exact frame would allocate a temporary oversized buffer.
  }
  override setSize(width: number, height: number, updateStyle = true): void {
    if (updateStyle && "style" in this.domElement) {
      const { style } = this.domElement;
      const w = `${width}px`,
        h = `${height}px`;
      if (style.width !== w) style.width = w;
      if (style.height !== h) style.height = h;
    }
  }
  override setDrawingBufferSize(width: number, height: number, pixelRatio: number): void {
    const w = Math.floor(width * pixelRatio),
      h = Math.floor(height * pixelRatio);
    if (!Number.isSafeInteger(w) || !Number.isSafeInteger(h) || w < 1 || h < 1)
      throw new RangeError("Invalid exact canvas dimensions.");
    this.getSize(this.size);
    if (
      this.domElement.width !== w ||
      this.domElement.height !== h ||
      this.size.x !== w ||
      this.size.y !== h
    )
      super.setDrawingBufferSize(w, h, 1);
  }
  override dispose(): void {
    if (this.closed) return;
    this.closed = true;
    super.dispose();
  }
}

/** Install before native context initialization, including the fallback renderer attempt. */
export function installExactCanvasTarget(
  renderer: WebGPURenderer,
  canvas: HTMLCanvasElement | OffscreenCanvas,
): void {
  if (canvas instanceof HTMLCanvasElement) canvas.dataset.rasterSizing = "exact-frame";
  const previous = renderer.getCanvasTarget();
  const target = new ExactCanvasTarget(canvas);
  renderer.setCanvasTarget(target);
  previous.dispose();
  const dispose = renderer.dispose.bind(renderer);
  renderer.dispose = async () => {
    try {
      await dispose();
    } finally {
      target.dispose();
    }
  };
}
