import type { MaskResult } from "./selection";
export type SelectionMode = "new" | "add" | "subtract" | "intersect";
export interface SelectionPreview {
  width: number;
  height: number;
  path: string;
  selected: number;
  simplified: boolean;
}
export interface PixelSelectionState extends SelectionPreview {
  layerId: string;
  tolerance: number;
  mode: SelectionMode;
  contiguous: boolean;
  busy: boolean;
  dragging: boolean;
  applying?: boolean;
  replacesMask?: boolean;
  error?: string;
}
export interface PixelSelectionPort {
  read: () => PixelSelectionState | null;
  subscribe: (listener: () => void) => () => void;
  begin(
    layerId: string,
    x: number,
    y: number,
    tolerance: number,
    mode?: SelectionMode,
    contiguous?: boolean,
  ): Promise<void>;
  update(tolerance: number): Promise<void>;
  accept(): Promise<void>;
  cancel(): void;
  invert(): Promise<void>;
  createMask(): Promise<void>;
  copyPixels(): Promise<void>;
  cutPixels(): Promise<void>;
  reselect(): Promise<void>;
  erase(): Promise<void>;
  deselect(): void;
  dispose(): void;
}
/** Selection producers publish coverage; shared presentation/actions stay algorithm independent. */
export interface MaskSelectionPort extends PixelSelectionPort {
  prepareMask(layerId: string): Promise<void>;
  previewMask(mask: MaskResult, holdBusy?: boolean): Promise<void>;
  setBusy(busy: boolean): void;
  failMask(error: string): void;
}
