import type { SelectionMode, SelectionPreview as WandPreview } from "../preview";
export type {
  SelectionMode,
  PixelSelectionState,
  PixelSelectionPort,
  SelectionPreview as WandPreview,
} from "../preview";
export type WandRequest =
  | { id: number; type: "source"; data: Uint8ClampedArray; width: number; height: number }
  | {
      id: number;
      type: "preview";
      x: number;
      y: number;
      tolerance: number;
      mode: SelectionMode;
      contiguous: boolean;
    }
  | { id: number; type: "mask"; data: Uint8ClampedArray; width: number; height: number }
  | { id: number; type: "accept" | "invert" | "export" };
export type WandResponse =
  | { id: number; preview: WandPreview }
  | { id: number; mask: { data: Uint8ClampedArray; width: number; height: number } }
  | { id: number; error: string };
