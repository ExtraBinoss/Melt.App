import type { ObjectCandidate, SelectionBox, SelectionPrompt } from "../prompts";
export interface ObjectSelectionState extends SelectionPrompt {
  layerId: string;
  width: number;
  height: number;
  busy: boolean;
  applying?: boolean;
  scanning: boolean;
  candidates: readonly ObjectCandidate[];
  error: string;
  mode: "points" | "box";
}
export interface ObjectSelectionPort {
  read(this: void): ObjectSelectionState | null;
  subscribe(this: void, listener: () => void): () => void;
  mode(this: void): "points" | "box";
  setMode(mode: "points" | "box"): void;
  point(layerId: string, x: number, y: number, foreground: boolean): Promise<void>;
  box(layerId: string, box: SelectionBox): Promise<void>;
  scan(layerId: string): Promise<void>;
  candidate(index: number): Promise<void>;
  removeLast(): Promise<void>;
  release(): void;
  reset(): void;
  dispose(): void;
}
