import type { ObjectCandidate, SelectionBox, SelectionPrompt } from "../prompts";
export interface ObjectSelectionState extends SelectionPrompt {
  layerId: string;
  targetName?: string;
  thumbnail?: string;
  width: number;
  height: number;
  busy: boolean;
  applying?: boolean;
  scanning: boolean;
  candidates: readonly ObjectCandidate[];
  error: string;
  mode: "points" | "box";
  automatic?: boolean;
  completed?: boolean;
  automaticMask?: string;
  hovering?: boolean;
  selected?: number;
}
export interface ObjectSelectionPort {
  read(this: void): ObjectSelectionState | null;
  subscribe(this: void, listener: () => void): () => void;
  mode(this: void): "points" | "box";
  setMode(mode: "points" | "box"): void;
  removeBackground(layerId: string): Promise<void>;
  refine(): void;
  background(layerId: string): Promise<void>;
  hover(layerId: string, x: number, y: number): Promise<void>;
  clearHover(): void;
  apply(): Promise<void>;
  point(layerId: string, x: number, y: number, foreground: boolean): Promise<void>;
  box(layerId: string, box: SelectionBox): Promise<void>;
  scan(layerId: string): Promise<void>;
  candidate(index: number): Promise<void>;
  removeLast(): Promise<void>;
  release(): void;
  reset(): void;
  dispose(): void;
}
