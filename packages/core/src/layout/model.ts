export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}
/** Authored capture framing and non-rendered editor guides; uses ordinary document history. */
export interface CaptureGuides {
  preset: string;
  width: number;
  height: number;
  full: boolean;
  visible: boolean;
  color: "cyan" | "magenta" | "lime" | "white";
  center: boolean;
  safeArea: "format" | "custom" | "none";
  margin: number;
}
export type WorkingColorSpace = "srgb" | "display-p3" | "cmyk" | "cmyk-proof";
export type Alignment = "start" | "center" | "end";
export type LayoutReference = "page" | "selection" | "parent";
export const ZERO_INSETS: Readonly<Insets> = Object.freeze({
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
});
