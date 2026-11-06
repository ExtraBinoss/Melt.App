/** A document global is independent from the user-wide palette it came from. */
export interface DocumentColor {
  id: string;
  name: string;
  value: string;
}
export interface PaletteSwatch {
  id: string;
  name: string;
  value: string;
  locked?: boolean;
}
export interface SavedPalette {
  id: string;
  name: string;
  colors: PaletteSwatch[];
}
export interface ColorTarget {
  pageId: string;
  layerId?: string;
  effectId?: string;
  property: string;
}
export type PaletteCommand =
  | { type: "setDocumentColors"; colors: DocumentColor[] }
  | { type: "deleteDocumentColor"; id: string }
  | { type: "linkDocumentColor"; targets: ColorTarget[]; colorId: string | null };
